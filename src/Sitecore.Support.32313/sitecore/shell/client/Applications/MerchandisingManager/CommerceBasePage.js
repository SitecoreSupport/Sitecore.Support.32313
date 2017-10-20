//     Copyright (c) Sitecore Corporation 1999-2017
/* jshint unused: vars */
require.config({
    config: {
        waitSeconds: 15
    },
    paths: {
        formatCurrency: "/sitecore/shell/client/Applications/MerchandisingManager/Assets/libs/jquery.formatCurrency-1.4.0.min",
        formatCurrencyRegions: "/sitecore/shell/client/Applications/MerchandisingManager/Assets/libs/jquery.formatCurrency.all",
        CommerceUtils: "/sitecore/shell/client/Applications/MerchandisingManager/CommerceUtils",
        Linq: "/sitecore/shell/client/Applications/MerchandisingManager/linq"
    },
    shim: {
        'formatCurrencyRegions': {
            deps: ['formatCurrency']
        }
    }
});

define(["sitecore", "formatCurrency", "formatCurrencyRegions", "CommerceUtils", "Linq", "knockout", "jquery"], function (Sitecore, formatCurrency, formatCurrencyRegions, CommerceUtils, Linq, ko, $) {
    (function () {
        if (typeof window.CustomEvent === "function") return false;

        function CustomEvent(event, params) {
            params = params || { bubbles: false, cancelable: false, detail: undefined };
            var evt = document.createEvent('CustomEvent');
            evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
            return evt;
        }

        CustomEvent.prototype = window.Event.prototype;

        window.CustomEvent = CustomEvent;
    }
    )();

    var CommerceBasePage = Sitecore.Definitions.App.extend({

        languagesPickerInitialized: false,

        operationInProgress: false,

        operationTimeoutRunning: false,

        languageSelections: [],

        itemPickerInitialized: false,

        shouldIdisplaySaveMessage: false,

        shouldIdisplayCreationMessage: false,

        itemPickerSelectedCategoriesMode: false,

        itemPickerSelectedProductsMode: false,

        itemPickerSelectedCatalogMode: false,

        itemPickerSelectedVariantMode: false,

        itemPickerCatalogFilter: null,

        isDirty: false,

        pageUnloading: false,

        isAXEnabled: false,

        listViewMode: "DetailList",

        createMessage: "",

        cbp: null,

        EnvironmentListReady: false,
        EnvironmentName: null,

        EnvironmentReady: new CustomEvent("environmentReady", {
            detail: {
                name: this.EnvironmentName
            },
            bubbles: true,
            cancelable: false
        }),

        Language: null,
        Currency: null,

        initialized: function () {
            var self = this;
            cbp = this;
            this.checkIfAXIsEnabled();
            environmentListInitiazed = false;

            // Set List view mode according to user preference
            self.listViewMode = this.getUsersListViewPreference();

            window.onerror = function (message, url, lineNo) {
                // excluding errors from jQueryUI
                if (url.indexOf("sitecore/shell/client/Speak/Assets/lib/ui/1.1/deps/jQueryUI") == -1 &&
                    url.indexOf("sitecore/shell/client/Speak/Assets/lib/ui/1.1/deps/CustomScrollbar") == -1) {
                    self.displayGeneralError();
                }
            };

            this.registerAjaxError();

            // Warn the user if they attempt to navigate away with unsaved changes
            window.onbeforeunload = function (e) {

                if (self.isDirty) {
                    var unsavedChangesMessage = self.ClientErrorMessages.get("You have unsaved changes");

                    if (!unsavedChangesMessage) {
                        unsavedChangesMessage = "You have unsaved changes.";
                    }

                    return unsavedChangesMessage;
                }

                this.pageUnloading = true;
            };

            // Track if the page is dirty 
            $(".bizToolsForms").change(function () {
                self.setPageIsDirty(true);
            });

            $(document).on("commerceImages_changed", function () {
                self.setPageIsDirty(true);
            });

            // Ignore errors caused by aborted ajax requests
            $(document).ajaxError(function (e, jqXHR, ajaxSettings, thrownError) {
                if (this.pageUnloading) {
                    e.stopPropagation();
                }
            });

            // listen for events from list control HTML Templates
            document.addEventListener('onSetPendingRelationshipDropDown', $.proxy(self.setPendingChangesDropDown, self), false);

            // Hook up the selected change event
            this.EnvironmentsDataSource.on("change:hasItems", this.onEnvironmentsDataSourceHasItems, this);
            this.EnvironmentsSwitcher.on("change:selectedItem", this.onSelectedEnvironmentChanged, this);

            // Initialize the EnvironmentsDataSource
            this.EnvironmentsDataSource.set("isReady", true);
            this.EnvironmentsDataSource.refresh();
        },

        onEnvironmentsDataSourceHasItems: function () {
            var target = this.EnvironmentsSwitcher;
            var self = this;
            this.getValueInUserProfile(function (data) {
                // Set the selected environment from the user's profile
                if (data !== "") {
                    var value = JSON.parse(data);
                    self.EnvironmentListReady = true;
                    self.EnvironmentName = value.Name;
                    target.set("selectedItem", value);
                    dispatchEvent(self.EnvironmentReady);
                }
                else {
                    // This will default to the first item in the list
                    self.EnvironmentListReady = true;
                    self.onSelectedEnvironmentChanged();
                }
            }, "BusinessTools", "EnvironmentId");
        },

        onSelectedEnvironmentChanged: function () {
            var selectedItem = this.EnvironmentsSwitcher.get("selectedItem");

            // Only refresh the environment when the selection is changed
            if (selectedItem !== null && (this.EnvironmentListReady === true && selectedItem.Name !== this.EnvironmentName)) {
                this.setValueInUserProfile("BusinessTools", "EnvironmentId", selectedItem);
                this.EnvironmentName = selectedItem.Name;
                dispatchEvent(this.EnvironmentReady);
            }
        },

        targetIsNotParent: function (item) {
            var targetId = this.get("targetId");
            return item.itemId != targetId;
        },

        isNameValid: function (name) {
            var regEx = /^[\w\*\$][\w\s\-\$]*(\(\d{1,}\)){0,1}$/;
            if (!regEx.test(name)) {
                var errorMessage = this.ClientErrorMessages.get("Invalid Name");
                this.ErrorsMessageBar.addMessage("error", Sitecore.Helpers.string.format(errorMessage, name));
                this.ErrorsMessageBar.set("isVisible", true);
                this.InProgress.hide();
                return false;
            }

            return true;
        },

        showHideExtendedSearchArea: function (e) {
            if (e.keyCode == '13') {
                e.preventDefault();
                cbp.search();
            }

            if ($("[data-sc-id=SearchBox]").val().length > 24) {
                $("#searchBoxExtended").show();
                $("#searchBoxExtended").focus();
                $("#searchBoxExtended").val($("[data-sc-id=SearchBox]").val());

            } else {
                $("#searchBoxExtended").hide();
                $("#searchBoxExtended").val("");
            }
        },

        addEnterKeySearchBox: function (e) {
            if (e.keyCode == '13') {
                e.preventDefault();
                cbp.search();
            }

            var extendedSearchBoxText = $("#searchBoxExtended").val();
            this.SearchBox.set("text", extendedSearchBoxText);
            if ($("#searchBoxExtended").val().length <= 24) {
                $("#searchBoxExtended").hide();
                $('[data-sc-id="SearchBox"]').focus();
            }
        },

        checkIfAXIsEnabled: function () {
            var attr = $("body").attr("data-sc-axmode");
            if (attr == "true" && this.disableIfAX) {
                this.isAXEnabled = true;
                this.disableIfAX();
            }
        },

        setPageIsDirty: function (dirty) {
            this.isDirty = dirty;
            this.updateSaveButton(dirty);
        },

        displayInProgressMessage: function () {
            this.InProgress.show();
            this.shouldIdisplaySaveMessage = false;
            this.shouldIdisplayCreationMessage = false;
            this.operationInProgress = true;
            this.operationTimeoutRunning = true;
            setTimeout($.proxy(this.hideInProgressTimeout, this), 3000);
        },

        addMedia: function (selected) {
            // If the media picker was launced by an extended media field, ignore this event.
            if (this.currentEditedMediaField) {
                return;
            }

            if (selected) {
                var currentImages = this.CommerceImages.get("images");
                if (currentImages) {
                    this.CommerceImages.set("images", this.CommerceImages.get("images").concat('|' + selected));
                } else {
                    this.CommerceImages.set("images", selected);
                }

            }
            $("[data-sc-id=SelectMediaDialogWindow]").modal("toggle");
        },

        hideInProgressTimeout: function () {
            this.operationTimeoutRunning = false;
            if (!this.operationInProgress) {
                this.InProgress.hide();
                if (this.shouldIdisplaySaveMessage === true) {
                    this.displaySaveMessage();
                }
                if (this.shouldIdisplayCreationMessage === true) {
                    this.displayCreationMessage(this.createMessage);
                }

            }
        },

        hideInProgressMessage: function (showSaveMessage) {
            this.operationInProgress = false;
            this.shouldIdisplaySaveMessage = showSaveMessage;
            if (!this.operationTimeoutRunning) {
                this.InProgress.hide();
                this.displaySaveMessage();
            }
        },

        hideInProgressMessageCreate: function (showCreateMessage, createMessage) {
            this.operationInProgress = false;
            this.shouldIdisplayCreationMessage = showCreateMessage;
            this.createMessage = createMessage;
            if (!this.operationTimeoutRunning) {
                this.InProgress.hide();
                this.displayCreationMessage(createMessage);
            }
        },

        displaySaveMessage: function () {
            this.SaveMessageBar.set("isVisible", true);
            setTimeout($.proxy(this.hideSaveMessage, this), 10000);
        },

        hideSaveMessage: function () {
            this.SaveMessageBar.set("isVisible", false);
        },

        displayGeneralError: function () {
            var errorMessage = this.ClientErrorMessages.get("General Failure");
            this.HeaderActionsMessageBar.removeMessages();
            this.HeaderActionsMessageBar.addMessage("error", errorMessage);
            this.HeaderActionsMessageBar.set("isVisible", true);
        },

        displayCreationMessage: function (creationMessage) {
            this.HeaderActionsMessageBar.removeMessages();
            this.HeaderActionsMessageBar.addMessage("notification", this.ClientErrorMessages.get(creationMessage));
            this.HeaderActionsMessageBar.set("isVisible", true);
            setTimeout($.proxy(this.hideCreationMessage, this), 10000);
        },

        hideCreationMessage: function () {
            this.HeaderActionsMessageBar.set("isVisible", false);
        },

        hideNotificationMessage: function () {
            this.HeaderActionsMessageBar.removeMessages();
            this.HeaderActionsMessageBar.set("isVisible", false);
        },

        registerAjaxError: function () {
            var self = this;
            $(document).ajaxError(function (event, request, settings) {
                self.displayGeneralError();
            });
        },

        doesItemHaveLayout: function () {
            var id = CommerceUtilities.loadPageVar("target");
            var self = this;

            var token = Sitecore.Helpers.antiForgery.getAntiForgeryToken();
            var ajaxToken = {};
            ajaxToken[token.headerKey] = token.value;

            $.ajax({
                url: "/sitecore/shell/commerce/merchandising/CommerceMetadata/DisplayPreviewButton",
                headers: ajaxToken,
                data: {
                    itemId: id
                },
                type: "POST",
                context: this,
                error: CommerceUtilities.IsAuthenticated,
                success: function (data) {
                    self.set("itemHasLayout", data);
                }
            });
        },

        previewItem: function () {
            var id = CommerceUtilities.loadPageVar("target");
            var language = CommerceUtilities.loadPageVar("lang");

            if (language == "en-US" || language === "") {
                language = "en";
            }
            var path = window.location.protocol + '//' + window.location.host;
            if (_sc.SiteInfo.virtualFolder != "/") {
                path += _sc.SiteInfo.virtualFolder;
            }

            var hostname = path + "?sc_mode=edit&sc_itemid=" + id + "&sc_lang=" + language;
            window.open(hostname, '_blank');
        },

        selectMedia: function () {
            if (this.CommerceImages.get("baseUrl") === "") {
                if (this.CommerceImages.get("isStandalone").toLowerCase() == "false") {
                    this.SelectMediaDialogWindow.show();
                } else {
                    //To be replaced with proper Alert Dialog
                    alert("In  a standalone version you need to set a base url in this CommerceImage control");
                }
            } else {
                this.BaseUrlMediaDialogWindow.show();
            }
        },

        search: function () {
            var searchTerm = this.SearchBox.get("text");

            if (searchTerm) {

                searchTerm = searchTerm.trim();

                if (searchTerm) {
                    window.location.assign('/sitecore/client/Applications/MerchandisingManager/search#' + searchTerm);
                }
            }
        },

        updateQueryStringParameter: function (uri, key, value) {
            var re = new RegExp("([?&])" + key + "=.*?(&|$|#)", "i");
            var separator = uri.indexOf('?') !== -1 ? "&" : "?";
            var newuri = "";
            if (uri.match(re)) {
                newuri = uri.replace(re, '$1' + key + "=" + value + '$2');
                return newuri;
            }
            var hash = '';
            if (uri.indexOf('#') > -1 && uri.indexOf('#') != uri.length) {
                hash = uri.substring(uri.indexOf('#') + 1, uri.length);
                uri = uri.substring(0, uri.indexOf('#'));
            }

            newuri = uri + separator + key + "=" + value;

            if (hash !== '') {
                newuri += '#' + hash;
            }

            return newuri;
        },

        isAnItemSelected: function (itemsList) {
            var checkedItems = itemsList.get("checkedItemIds");
            return (checkedItems && checkedItems.length > 0);
        },

        clearSelectedItems: function () {
            // this.PickerPageSubApp.PickerCategoriesList.set("checkedItems", null);
            // this.PickerPageSubApp.PickerProductList.set("checkedItems", null);
            alert("Not yet Implemented.");
        },

        setSelectedCategoriesVisiblity: function (vis) {
            this.PickerPageSubApp.PickerSelectedCategoriesList.set("isVisible", vis);

            this.PickerPageSubApp.PickerCategoriesList.set("isVisible", vis);
        },

        setSelectedProductsVisibility: function (vis) {
            this.PickerPageSubApp.PickerSelectedProductList.set("isVisible", vis);

            this.PickerPageSubApp.PickerProductList.set("isVisible", vis);
        },

        setSelectedCatalogsVisibility: function (vis) {
            this.PickerPageSubApp.PickerSelectedCatalogList.set("isVisible", vis);

            this.PickerPageSubApp.PickerCatalogsList.set("isVisible", vis);
        },

        setSelectedVariantsVisibility: function (vis) {
            this.PickerPageSubApp.PickerSelectedVariantList.set("isVisible", vis);

            this.PickerPageSubApp.PickerVariantsList.set("isVisible", vis);
        },

        initializeItemPicker: function () {

            if (this.itemPickerInitialized === false) {

                // Set the current catalog filter
                this.PickerPageSubApp.PickProductsDataSource.set("catalogName", this.itemPickerCatalogFilter);
                this.PickerPageSubApp.PickCategoriesDataSource.set("catalogName", this.itemPickerCatalogFilter);
                this.PickerPageSubApp.PickCatalogsDataSource.set("catalogName", this.itemPickerCatalogFilter);
                this.PickerPageSubApp.PickVariantsDataSource.set("catalogName", this.itemPickerCatalogFilter);

                // Initialize the picker's data sources and query
                this.PickerPageSubApp.PickProductsDataSource.set("isReady", true);
                this.PickerPageSubApp.PickCategoriesDataSource.set("isReady", true);
                this.PickerPageSubApp.PickCatalogsDataSource.set("isReady", true);
                this.PickerPageSubApp.PickVariantsDataSource.set("isReady", true);


                $("li[data-tab-id=\\{1BEFF994-0E31-457D-AA5F-5C39853E5ADD\\}] > a").append("<span class='badge'></span>");
                $("li[data-tab-id=\\{98766E08-3633-45C4-92BA-353BE5EFC445\\}] > a").append("<span class='badge'></span>");
                $("li[data-tab-id=\\{78F2B183-B384-440C-8D2A-A0621DA83789\\}] > a").append("<span class='badge'></span>");
                $("li[data-tab-id=\\{957A5534-78F2-4EBE-A313-745E710BE238\\}] > a").append("<span class='badge'></span>");

                this.PickerPageSubApp.PickProductsDataSource.on("change:totalItemCount", this.pickProductCountChanged, this);
                this.PickerPageSubApp.PickCategoriesDataSource.on("change:totalItemCount", this.pickCategoriesCountChanged, this);
                this.PickerPageSubApp.PickCatalogsDataSource.on("change:totalItemCount", this.pickCatalogsCountChanged, this);
                this.PickerPageSubApp.PickVariantsDataSource.on("change:totalItemCount", this.pickVariantsCountChanged, this);

                this.PickerPageSubApp.PickerActionControl.viewModel.$el.appendTo(this.PickerPageSubApp.PickerBorderWrapper.viewModel.$el);

                this.PickerPageSubApp.searchItemPicker();
            }
        },

        pickProductCountChanged: function () {
            var count = this.PickerPageSubApp.PickProductsDataSource.get("totalItemCount") > 99 ? "99+" : this.PickerPageSubApp.PickProductsDataSource.get("totalItemCount");
            $("li[data-tab-id=\\{1BEFF994-0E31-457D-AA5F-5C39853E5ADD\\}] > a > span").html(count);
        },

        pickCategoriesCountChanged: function () {
            var count = this.PickerPageSubApp.PickCategoriesDataSource.get("totalItemCount") > 99 ? "99+" : this.PickerPageSubApp.PickCategoriesDataSource.get("totalItemCount");
            $("li[data-tab-id=\\{98766E08-3633-45C4-92BA-353BE5EFC445\\}] > a > span").html(count);
        },

        pickCatalogsCountChanged: function () {
            var count = this.PickerPageSubApp.PickCatalogsDataSource.get("totalItemCount") > 99 ? "99+" : this.PickerPageSubApp.PickCatalogsDataSource.get("totalItemCount");
            $("li[data-tab-id=\\{78F2B183-B384-440C-8D2A-A0621DA83789\\}] > a > span").html(count);
        },

        pickVariantsCountChanged: function () {
            var count = this.PickerPageSubApp.PickVariantsDataSource.get("totalItemCount") > 99 ? "99+" : this.PickerPageSubApp.PickVariantsDataSource.get("totalItemCount");
            $("li[data-tab-id=\\{957A5534-78F2-4EBE-A313-745E710BE238\\}] > a > span").html(count);
        },

        resetItemPicker: function () {
            // Ensure ItemPicker has been initialized
            if (this.itemPickerInitialized === false) {
                this.initializeItemPicker();
                this.itemPickerInitialized = true;
            } else {
                // Reset the item picker state
                //
                // Workaround to prevent momentary visibility of previous 
                // search results
                this.PickerPageSubApp.PickCategoriesDataSource.set("items", []);
                this.PickerPageSubApp.PickProductsDataSource.set("items", []);
                this.PickerPageSubApp.PickCatalogsDataSource.set("items", []);
                this.PickerPageSubApp.PickVariantsDataSource.set("items", []);

                this.PickerPageSubApp.PickerCategoriesList.set("checkedItems", []);
                this.PickerPageSubApp.PickerProductList.set("checkedItems", []);
                this.PickerPageSubApp.PickerCatalogsList.set("checkedItems", []);
                this.PickerPageSubApp.PickerVariantsList.set("checkedItems", []);

                this.PickerPageSubApp.PickerSelectedCategoriesList.set("items", []);
                this.PickerPageSubApp.PickerSelectedProductList.set("items", []);
                this.PickerPageSubApp.PickerSelectedCatalogList.set("items", []);
                this.PickerPageSubApp.PickerSelectedVariantList.set("items", []);

                // Set the current catalog filter
                this.PickerPageSubApp.PickProductsDataSource.set("catalogName", this.itemPickerCatalogFilter);
                this.PickerPageSubApp.PickCategoriesDataSource.set("catalogName", this.itemPickerCatalogFilter);
                this.PickerPageSubApp.PickCatalogsDataSource.set("catalogName", this.itemPickerCatalogFilter);
                this.PickerPageSubApp.PickVariantsDataSource.set("catalogName", this.itemPickerCatalogFilter);

                // Hide the selected items list
                this.PickerPageSubApp.PickerSelectedCategoriesList.set("isVisible", false);
                this.PickerPageSubApp.PickerSelectedProductList.set("isVisible", false);
                this.PickerPageSubApp.PickerSelectedCatalogList.set("isVisible", false);
                this.PickerPageSubApp.PickerSelectedVariantList.set("isVisible", false);

                this.itemPickerSelectedCategoriesMode = false;
                this.itemPickerSelectedProductsMode = false;
                this.itemPickerSelectedCatalogMode = false;
                this.itemPickerSelectedVariantMode = false;

                this.PickerPageSubApp.PickerSmartPanel.set("isOpen", false);

                this.PickerPageSubApp.PickerSearchBox.set("text", "");
                this.PickerPageSubApp.searchItemPicker();

                // Ensure action control buttons are in unselected state
                var actionButtons = this.PickerPageSubApp.PickerActionControl.get("actions");
                if (actionButtons) {
                    for (i = 0; i < actionButtons.length; i++) {
                        var action = actionButtons[i];
                        this.PickerPageSubApp.PickerActionControl.viewModel.setActiveState(action, false);
                    }
                }

                // Ensure the tab text is reset
                var countCat = this.PickerPageSubApp.PickCategoriesDataSource.get("totalItemCount") > 99 ? "99+" : this.PickerPageSubApp.PickCategoriesDataSource.get("totalItemCount");
                var countProd = this.PickerPageSubApp.PickProductsDataSource.get("totalItemCount") > 99 ? "99+" : this.PickerPageSubApp.PickProductsDataSource.get("totalItemCount");
                var countCatalog = this.PickerPageSubApp.PickCatalogsDataSource.get("totalItemCount") > 99 ? "99+" : this.PickerPageSubApp.PickCatalogsDataSource.get("totalItemCount");
                var countVar = this.PickerPageSubApp.PickVariantsDataSource.get("totalItemCount") > 99 ? "99+" : this.PickerPageSubApp.PickVariantsDataSource.get("totalItemCount");

                $("li[data-tab-id=\\{1BEFF994-0E31-457D-AA5F-5C39853E5ADD\\}] > a > span").html(countProd);
                $("li[data-tab-id=\\{98766E08-3633-45C4-92BA-353BE5EFC445\\}] > a > span").html(countCat);
                $("li[data-tab-id=\\{78F2B183-B384-440C-8D2A-A0621DA83789\\}] > a > span").html(countCatalog);
                $("li[data-tab-id=\\{957A5534-78F2-4EBE-A313-745E710BE238\\}] > a > span").html(countVar);

                // Clear any list selections from the last invokation
                var pickerListControls = [this.PickerPageSubApp.PickerCatalogsList, this.PickerPageSubApp.PickerCategoriesList, this.PickerPageSubApp.PickerProductList, this.PickerPageSubApp.PickerVariantsList];
                for (i = 0; i < pickerListControls.length; i++) {
                    var list = pickerListControls[i];
                    if (list) {
                        var selectedListItems = list.get("checkedItemIds");
                        list.viewModel.uncheckItems(selectedListItems);
                    }
                }
            }
        },

        setCategoryOnlyPickerMode: function () {

            if (this.PickerPageSubApp.PickerProductList && this.PickerPageSubApp.PickerCategoriesList && this.PickerPageSubApp.ItemPickerTabs) {
                // Set the picker mode
                this.PickerPageSubApp.PickerMode.set("text", "CategoryOnly");

                // Initialize ItemPicker state
                this.resetItemPicker();

                // Hide the products list control and show the category list
                this.PickerPageSubApp.PickerProductList.set("isVisible", false);
                this.PickerPageSubApp.PickerCategoriesList.set("isVisible", true);
                this.PickerPageSubApp.PickerCatalogsList.set("isVisible", false);
                this.PickerPageSubApp.PickerVariantsList.set("isVisible", false);

                // Show the categories tab
                var categoriesTab = $("li[data-tab-id='{98766E08-3633-45C4-92BA-353BE5EFC445}']");
                categoriesTab.show();

                // Hide the products tab
                var productsTab = $("li[data-tab-id='{1BEFF994-0E31-457D-AA5F-5C39853E5ADD}']");
                productsTab.hide();

                // Hide the catalogs tab
                var catalogsTab = $("li[data-tab-id='{78F2B183-B384-440C-8D2A-A0621DA83789}']");
                catalogsTab.hide();

                // Hide the variants tab
                var variantsTab = $("li[data-tab-id='{957A5534-78F2-4EBE-A313-745E710BE238}']");
                variantsTab.hide();

                // Set categories as the selected tab 
                this.PickerPageSubApp.ItemPickerTabs.set("selectedTab", "{98766E08-3633-45C4-92BA-353BE5EFC445}");

                //Show only selected categories icon
                this.PickerPageSubApp.PickerActionControl.get("actions")[1].isVisible(true);
                this.PickerPageSubApp.PickerActionControl.get("actions")[2].isVisible(false);
                this.PickerPageSubApp.PickerActionControl.get("actions")[3].isVisible(false);
                this.PickerPageSubApp.PickerActionControl.get("actions")[4].isVisible(false);
                //Add the icons for catalog and variant tabs

                var categoriesSelectedFavorite = $("li[data-sc-actionid='8902FA4BAEC44AC5ADFEA8AC87EDC157']");
                categoriesSelectedFavorite.show();
                var productsSelectedFavorite = $("li[data-sc-actionid='9EB96FB90AD84A60A75077B15369CC6D']");
                productsSelectedFavorite.hide();
                var catalogsSelectedFavorite = $("li[data-sc-actionid='23DB0F4C654645699C811F02A7388F80']");
                catalogsSelectedFavorite.hide();
                var variantsSelectedFavorite = $("li[data-sc-actionid='7DA40A62DDB24CF09DD9957D343202A6']");
                variantsSelectedFavorite.hide();

                // Facets
                this.PickerPageSubApp.PickerCategoryFacets.set("isVisible", true);
                this.PickerPageSubApp.PickerProductFacets.set("isVisible", false);
                this.PickerPageSubApp.PickerCatalogFacets.set("isVisible", false);
                this.PickerPageSubApp.PickerVariantFacets.set("isVisible", false);
            }
        },

        setProductOnlyPickerMode: function () {

            if (this.PickerPageSubApp.PickerProductList && this.PickerPageSubApp.PickerCategoriesList && this.PickerPageSubApp.ItemPickerTabs) {
                // Set the picker mode
                this.PickerPageSubApp.PickerMode.set("text", "ProductOnly");

                // Initialize ItemPicker state
                this.resetItemPicker();

                // Hide the category list control and show the product list
                this.PickerPageSubApp.PickerProductList.set("isVisible", true);
                this.PickerPageSubApp.PickerCategoriesList.set("isVisible", false);
                this.PickerPageSubApp.PickerCatalogsList.set("isVisible", false);
                this.PickerPageSubApp.PickerVariantsList.set("isVisible", false);

                // Hide the categories tab
                var categoriesTab = $("li[data-tab-id='{98766E08-3633-45C4-92BA-353BE5EFC445}']");
                categoriesTab.hide();

                // Show the products tab
                var productsTab = $("li[data-tab-id='{1BEFF994-0E31-457D-AA5F-5C39853E5ADD}']");
                productsTab.show();

                // Hide the catalogs tab
                var catalogsTab = $("li[data-tab-id='{78F2B183-B384-440C-8D2A-A0621DA83789}']");
                catalogsTab.hide();

                // Hide the variants tab
                var variantsTab = $("li[data-tab-id='{957A5534-78F2-4EBE-A313-745E710BE238}']");
                variantsTab.hide();

                // Set products as the selected tab 
                this.PickerPageSubApp.ItemPickerTabs.set("selectedTab", "{1BEFF994-0E31-457D-AA5F-5C39853E5ADD}");

                //Show only selected categories icon
                this.PickerPageSubApp.PickerActionControl.get("actions")[1].isVisible(false);
                this.PickerPageSubApp.PickerActionControl.get("actions")[2].isVisible(true);
                this.PickerPageSubApp.PickerActionControl.get("actions")[3].isVisible(false);
                this.PickerPageSubApp.PickerActionControl.get("actions")[4].isVisible(false);
                //Add the icons for catalog and variant tabs

                var categoriesSelectedFavorite = $("li[data-sc-actionid='8902FA4BAEC44AC5ADFEA8AC87EDC157']");
                categoriesSelectedFavorite.hide();
                var productsSelectedFavorite = $("li[data-sc-actionid='9EB96FB90AD84A60A75077B15369CC6D']");
                productsSelectedFavorite.show();
                var catalogsSelectedFavorite = $("li[data-sc-actionid='23DB0F4C654645699C811F02A7388F80']");
                catalogsSelectedFavorite.hide();
                var variantsSelectedFavorite = $("li[data-sc-actionid='7DA40A62DDB24CF09DD9957D343202A6']");
                variantsSelectedFavorite.hide();

                // Facets
                this.PickerPageSubApp.PickerCategoryFacets.set("isVisible", false);
                this.PickerPageSubApp.PickerProductFacets.set("isVisible", true);
                this.PickerPageSubApp.PickerCatalogFacets.set("isVisible", false);
                this.PickerPageSubApp.PickerVariantFacets.set("isVisible", false);
            }
        },

        setCatalogOnlyPickerMode: function () {

            if (this.PickerPageSubApp.PickerProductList && this.PickerPageSubApp.PickerCategoriesList && this.PickerPageSubApp.PickerCatalogsList && this.PickerPageSubApp.PickerVariantsList && this.PickerPageSubApp.ItemPickerTabs) {
                // Set the picker mode
                this.PickerPageSubApp.PickerMode.set("text", "CatalogOnly");

                // Initialize ItemPicker state
                this.resetItemPicker();

                // Hide the category list control and show the product list
                this.PickerPageSubApp.PickerProductList.set("isVisible", false);
                this.PickerPageSubApp.PickerCategoriesList.set("isVisible", false);
                this.PickerPageSubApp.PickerCatalogsList.set("isVisible", true);
                this.PickerPageSubApp.PickerVariantsList.set("isVisible", false);

                // Hide the categories tab
                var categoriesTab = $("li[data-tab-id='{98766E08-3633-45C4-92BA-353BE5EFC445}']");
                categoriesTab.hide();

                // Show the products tab
                var productsTab = $("li[data-tab-id='{1BEFF994-0E31-457D-AA5F-5C39853E5ADD}']");
                productsTab.hide();

                // Hide the catalogs tab
                var catalogsTab = $("li[data-tab-id='{78F2B183-B384-440C-8D2A-A0621DA83789}']");
                catalogsTab.show();

                // Hide the variants tab
                var variantsTab = $("li[data-tab-id='{957A5534-78F2-4EBE-A313-745E710BE238}']");
                variantsTab.hide();

                // Set products as the selected tab 
                this.PickerPageSubApp.ItemPickerTabs.set("selectedTab", "{78F2B183-B384-440C-8D2A-A0621DA83789}");

                //Show only selected categories icon
                this.PickerPageSubApp.PickerActionControl.get("actions")[1].isVisible(false);
                this.PickerPageSubApp.PickerActionControl.get("actions")[2].isVisible(false);
                this.PickerPageSubApp.PickerActionControl.get("actions")[3].isVisible(true);
                this.PickerPageSubApp.PickerActionControl.get("actions")[4].isVisible(false);
                //Add the icons for catalog and variant tabs

                var categoriesSelectedFavorite = $("li[data-sc-actionid='8902FA4BAEC44AC5ADFEA8AC87EDC157']");
                categoriesSelectedFavorite.hide();
                var productsSelectedFavorite = $("li[data-sc-actionid='9EB96FB90AD84A60A75077B15369CC6D']");
                productsSelectedFavorite.hide();
                var catalogsSelectedFavorite = $("li[data-sc-actionid='23DB0F4C654645699C811F02A7388F80']");
                catalogsSelectedFavorite.show();
                var variantsSelectedFavorite = $("li[data-sc-actionid='7DA40A62DDB24CF09DD9957D343202A6']");
                variantsSelectedFavorite.hide();

                // Facets
                this.PickerPageSubApp.PickerCategoryFacets.set("isVisible", false);
                this.PickerPageSubApp.PickerProductFacets.set("isVisible", true);
                this.PickerPageSubApp.PickerCatalogFacets.set("isVisible", false);
                this.PickerPageSubApp.PickerVariantFacets.set("isVisible", false);
            }
        },

        setVariantOnlyPickerMode: function () {

            if (this.PickerPageSubApp.PickerProductList && this.PickerPageSubApp.PickerCategoriesList && this.PickerPageSubApp.PickerCatalogsList && this.PickerPageSubApp.PickerVariantsList && this.PickerPageSubApp.ItemPickerTabs) {
                // Set the picker mode
                this.PickerPageSubApp.PickerMode.set("text", "VariantOnly");

                // Initialize ItemPicker state
                this.resetItemPicker();

                // Hide the category list control and show the product list
                this.PickerPageSubApp.PickerProductList.set("isVisible", false);
                this.PickerPageSubApp.PickerCategoriesList.set("isVisible", false);
                this.PickerPageSubApp.PickerCatalogsList.set("isVisible", false);
                this.PickerPageSubApp.PickerVariantsList.set("isVisible", true);

                // Hide the categories tab
                var categoriesTab = $("li[data-tab-id='{98766E08-3633-45C4-92BA-353BE5EFC445}']");
                categoriesTab.hide();

                // Show the products tab
                var productsTab = $("li[data-tab-id='{1BEFF994-0E31-457D-AA5F-5C39853E5ADD}']");
                productsTab.hide();

                // Hide the catalogs tab
                var catalogsTab = $("li[data-tab-id='{78F2B183-B384-440C-8D2A-A0621DA83789}']");
                catalogsTab.hide();

                // Hide the variants tab
                var variantsTab = $("li[data-tab-id='{957A5534-78F2-4EBE-A313-745E710BE238}']");
                variantsTab.show();

                // Set products as the selected tab 
                this.PickerPageSubApp.ItemPickerTabs.set("selectedTab", "{957A5534-78F2-4EBE-A313-745E710BE238}");

                //Show only selected categories icon
                this.PickerPageSubApp.PickerActionControl.get("actions")[1].isVisible(false);
                this.PickerPageSubApp.PickerActionControl.get("actions")[2].isVisible(false);
                this.PickerPageSubApp.PickerActionControl.get("actions")[3].isVisible(false);
                this.PickerPageSubApp.PickerActionControl.get("actions")[4].isVisible(true);
                //Add the icons for catalog and variant tabs

                var categoriesSelectedFavorite = $("li[data-sc-actionid='8902FA4BAEC44AC5ADFEA8AC87EDC157']");
                categoriesSelectedFavorite.hide();
                var productsSelectedFavorite = $("li[data-sc-actionid='9EB96FB90AD84A60A75077B15369CC6D']");
                productsSelectedFavorite.hide();
                var catalogsSelectedFavorite = $("li[data-sc-actionid='23DB0F4C654645699C811F02A7388F80']");
                catalogsSelectedFavorite.hide();
                var variantsSelectedFavorite = $("li[data-sc-actionid='7DA40A62DDB24CF09DD9957D343202A6']");
                variantsSelectedFavorite.show();

                // Facets
                this.PickerPageSubApp.PickerCategoryFacets.set("isVisible", false);
                this.PickerPageSubApp.PickerProductFacets.set("isVisible", false);
                this.PickerPageSubApp.PickerCatalogFacets.set("isVisible", false);
                this.PickerPageSubApp.PickerVariantFacets.set("isVisible", true);
            }
        },

        setAllTabsPickerMode: function () {

            if (this.PickerPageSubApp.PickerProductList && this.PickerPageSubApp.PickerCategoriesList && this.PickerPageSubApp.PickerCatalogsList && this.PickerPageSubApp.PickerVariantsList && this.PickerPageSubApp.ItemPickerTabs) {
                // Set the picker mode
                this.PickerPageSubApp.PickerMode.set("text", "AllTabs");

                // In this mode, we should exclude the current catalog
                var currentCatalogId = CommerceUtilities.loadPageVar("target");
                this.PickerPageSubApp.PickCatalogsDataSource.set("exclusions", currentCatalogId);
                this.PickerPageSubApp.PickCategoriesDataSource.set("exclusions", currentCatalogId);
                this.PickerPageSubApp.PickProductsDataSource.set("exclusions", currentCatalogId);

                // Initialize ItemPicker state
                this.resetItemPicker();

                // Hide the category list control and show the product list
                this.PickerPageSubApp.PickerProductList.set("isVisible", false);
                this.PickerPageSubApp.PickerCategoriesList.set("isVisible", true);
                this.PickerPageSubApp.PickerCatalogsList.set("isVisible", false);
                this.PickerPageSubApp.PickerVariantsList.set("isVisible", false);

                // Show the categories tab
                var categoriesTab = $("li[data-tab-id='{98766E08-3633-45C4-92BA-353BE5EFC445}']");
                categoriesTab.show();

                // Show the products tab
                var productsTab = $("li[data-tab-id='{1BEFF994-0E31-457D-AA5F-5C39853E5ADD}']");
                productsTab.show();

                // Show the catalogs tab
                var catalogsTab = $("li[data-tab-id='{78F2B183-B384-440C-8D2A-A0621DA83789}']");
                catalogsTab.show();

                // Hide the variants tab
                var variantsTab = $("li[data-tab-id='{957A5534-78F2-4EBE-A313-745E710BE238}']");
                variantsTab.hide();

                // Set categories as the selected tab 
                this.PickerPageSubApp.ItemPickerTabs.set("selectedTab", "{98766E08-3633-45C4-92BA-353BE5EFC445}");

                //Show only selected categories icon
                this.PickerPageSubApp.PickerActionControl.get("actions")[1].isVisible(true);
                this.PickerPageSubApp.PickerActionControl.get("actions")[2].isVisible(false);
                this.PickerPageSubApp.PickerActionControl.get("actions")[3].isVisible(false);
                this.PickerPageSubApp.PickerActionControl.get("actions")[4].isVisible(false);
                //Add the icons for catalog and variant tabs

                var categoriesSelectedFavorite = $("li[data-sc-actionid='8902FA4BAEC44AC5ADFEA8AC87EDC157']");
                categoriesSelectedFavorite.show();
                var productsSelectedFavorite = $("li[data-sc-actionid='9EB96FB90AD84A60A75077B15369CC6D']");
                productsSelectedFavorite.show();
                var catalogsSelectedFavorite = $("li[data-sc-actionid='23DB0F4C654645699C811F02A7388F80']");
                catalogsSelectedFavorite.show();
                var variantsSelectedFavorite = $("li[data-sc-actionid='7DA40A62DDB24CF09DD9957D343202A6']");
                variantsSelectedFavorite.show();

                // Facets
                this.PickerPageSubApp.PickerCategoryFacets.set("isVisible", true);
                this.PickerPageSubApp.PickerProductFacets.set("isVisible", true);
                this.PickerPageSubApp.PickerCatalogFacets.set("isVisible", true);
                this.PickerPageSubApp.PickerVariantFacets.set("isVisible", true);
            }
        },

        setDefaultPickerMode: function () {

            if (this.PickerPageSubApp.PickerProductList && this.PickerPageSubApp.PickerCategoriesList && this.PickerPageSubApp.ItemPickerTabs) {
                // Set the picker mode
                this.PickerPageSubApp.PickerMode.set("text", "Default");

                // Initialize ItemPicker state
                this.resetItemPicker();

                // Hide the category list control and show the product list
                this.PickerPageSubApp.PickerProductList.set("isVisible", false);
                this.PickerPageSubApp.PickerCategoriesList.set("isVisible", true);
                this.PickerPageSubApp.PickerCatalogsList.set("isVisible", false);
                this.PickerPageSubApp.PickerVariantsList.set("isVisible", false);

                // Show the categories tab
                var categoriesTab = $("li[data-tab-id='{98766E08-3633-45C4-92BA-353BE5EFC445}']");
                categoriesTab.show();

                // Show the products tab
                var productsTab = $("li[data-tab-id='{1BEFF994-0E31-457D-AA5F-5C39853E5ADD}']");
                productsTab.show();

                // Hide the catalogs tab
                var catalogsTab = $("li[data-tab-id='{78F2B183-B384-440C-8D2A-A0621DA83789}']");
                catalogsTab.hide();

                // Hide the variants tab
                var variantsTab = $("li[data-tab-id='{957A5534-78F2-4EBE-A313-745E710BE238}']");
                variantsTab.hide();

                // Set categories as the selected tab 
                this.PickerPageSubApp.ItemPickerTabs.set("selectedTab", "{98766E08-3633-45C4-92BA-353BE5EFC445}");

                //Show only selected categories icon
                this.PickerPageSubApp.PickerActionControl.get("actions")[1].isVisible(true);
                this.PickerPageSubApp.PickerActionControl.get("actions")[2].isVisible(false);
                this.PickerPageSubApp.PickerActionControl.get("actions")[3].isVisible(false);
                this.PickerPageSubApp.PickerActionControl.get("actions")[4].isVisible(false);



                var categoriesSelectedFavorite = $("li[data-sc-actionid='8902FA4BAEC44AC5ADFEA8AC87EDC157']");
                categoriesSelectedFavorite.show();
                var productsSelectedFavorite = $("li[data-sc-actionid='9EB96FB90AD84A60A75077B15369CC6D']");
                productsSelectedFavorite.show();
                var catalogsSelectedFavorite = $("li[data-sc-actionid='23DB0F4C654645699C811F02A7388F80']");
                catalogsSelectedFavorite.hide();
                var variantsSelectedFavorite = $("li[data-sc-actionid='7DA40A62DDB24CF09DD9957D343202A6']");
                variantsSelectedFavorite.hide();

                // Facets
                this.PickerPageSubApp.PickerCategoryFacets.set("isVisible", true);
                this.PickerPageSubApp.PickerProductFacets.set("isVisible", true);
                this.PickerPageSubApp.PickerCatalogFacets.set("isVisible", false);
                this.PickerPageSubApp.PickerVariantFacets.set("isVisible", false);
            }
        },

        addRelationship: function (relationShipName, relationShipLabel) {
            this.itemPickerCatalogFilter = null;
            this.currentRelationshipName = relationShipName;
            this.setDefaultPickerMode();
            this.setItemPickerHeaderTitle(relationShipLabel);
            this.ItemPicker.show();
            this.RelationshipsContextMenu.toggle();
            this.PickerPageSubApp.PickerSearchBox.viewModel.$el.focus();
        },

        //Header Actions Menu Functions
        refreshSiteCaches: function () {
            var token = Sitecore.Helpers.antiForgery.getAntiForgeryToken();
            var ajaxToken = {};
            ajaxToken[token.headerKey] = token.value;
            $.ajax({
                url: "/sitecore/shell/commerce/merchandising/CommerceCatalogAction/RefreshSiteCaches",
                type: "POST",
                headers: ajaxToken,
                context: this,
                error: CommerceUtilities.IsAuthenticated,
                success: function (data) {
                    this.HeaderActionsMessageBar.addMessage("notification", data.Message);
                    this.HeaderActionsMessageBar.set("isVisible", true);
                    setTimeout($.proxy(this.hideHeaderActionsMessage, this), 3000);
                }
            });
        },

        updateServerIndex: function () {
            var token = Sitecore.Helpers.antiForgery.getAntiForgeryToken();
            var ajaxToken = {};
            ajaxToken[token.headerKey] = token.value;
            $.ajax({
                url: "/sitecore/shell/commerce/merchandising/CommerceCatalogAction/UpdateServerIndex",
                type: "POST",
                headers: ajaxToken,
                context: this,
                error: CommerceUtilities.IsAuthenticated,
                success: function (data) {
                    this.HeaderActionsMessageBar.addMessage("notification", data.Message);
                    this.HeaderActionsMessageBar.set("isVisible", true);
                    setTimeout($.proxy(this.hideHeaderActionsMessage, this), 3000);
                }
            });
        },

        hideHeaderActionsMessage: function () {
            this.HeaderActionsMessageBar.set("isVisible", false);
            this.HeaderActionsMessageBar.removeMessages();
        },

        mainHeaderHelp: function () {
            if (this.HelpProvider.get("hasItems")) {
                var selectedTab = this.get("selectedTab");
                var helpItems = Enumerable.From(this.HelpProvider.get("items"));
                var result = helpItems.Where(function (x) { return x["Linked Item"] == selectedTab }).ToArray();
                if (result.length > 0) {
                    var matchItem = result[0];
                    var help = matchItem["Base Url"] + "/" + matchItem.Locale + "/" + matchItem["Help Topic"];
                    window.open(help);
                } else {
                    var matchItem = helpItems.Where(function (x) { return x["Linked Item"] == "redirectPage" }).ToArray()[0];
                    var help = matchItem["Base Url"] + "/" + matchItem.Locale + "/" + matchItem["Help Topic"];
                    window.open(help);
                }
            }
        },

        wireUpCreateLanguage: function () {
            var token = Sitecore.Helpers.antiForgery.getAntiForgeryToken();
            var ajaxToken = {};
            ajaxToken[token.headerKey] = token.value;

            $.ajax({
                url: "/sitecore/shell/commerce/merchandising/CommerceMetadata/GetDefaultLanguage",
                type: "POST",
                headers: ajaxToken,
                context: this,
                error: CommerceUtilities.IsAuthenticated,
                success: function (data) {
                    this.DefaultLanguageCombobox.set("items", data.Items);
                    this.DefaultLanguageCombobox.set("selectedItemId", data.Items[0].itemId);

                    this.languageSelections = [];
                    this.languageSelections.push(data.Items[0].culture);
                }
            });
        },

        initializeLanguagePickerForCreate: function () {
            this.SelectLanguagesSubApp.LanguagesFilterTextBox.on("change", this.filterLanguagesList, this);
            this.addSpansToLanguagesTab();

            this.SelectLanguagesSubApp.SelectLanguagesDataSource.on("change:totalItemCount", this.languagesCountChanged, this);

            var createLang = this.DefaultLanguageCombobox.get("items");
            var array = [];
            array.push(createLang[0].culture);
            this.SelectLanguagesSubApp.SelectLanguagesList.viewModel.checkItems(array);
        },

        initializeLanguagesPicker: function () {
            var catalogId = this.get("targetId");

            this.SelectLanguagesSubApp.LanguagesFilterTextBox.on("change", this.filterLanguagesList, this);
            this.addSpansToLanguagesTab();

            this.SelectLanguagesSubApp.SelectLanguagesDataSource.on("change:totalItemCount", this.languagesCountChanged, this);

            this.SelectLanguagesSubApp.SelectCatalogLanguagesDataSource.set("commerceItemId", catalogId);
            this.SelectLanguagesSubApp.SelectCatalogLanguagesDataSource.set("isReady", true);

            // When this completes set the selections in the SelectLanguagesList
            this.SelectLanguagesSubApp.SelectCatalogLanguagesDataSource.setCompletedQueryCallback($.proxy(this.checkCatalogLanguages, this));
            this.SelectLanguagesSubApp.SelectCatalogLanguagesDataSource.refresh();
        },

        checkCatalogLanguages: function () {
            var catalogLanguages = this.SelectLanguagesSubApp.SelectCatalogLanguagesDataSource.get("items");

            var catalogLanguageIds = [];
            if (catalogLanguages && catalogLanguages.length > 0) {
                for (i = 0; i < catalogLanguages.length; i++) {
                    catalogLanguageIds.push(catalogLanguages[i].itemId);
                }
            }

            this.SelectLanguagesSubApp.SelectLanguagesList.viewModel.checkItems(catalogLanguageIds);
            this.languageSelections = catalogLanguageIds;
        },

        showLanguagesPicker: function () {
            var targetId = this.get("targetId");

            if (this.LanguagePicker) {

                if (this.languagesPickerInitialized === false) {
                    if (targetId) {
                        // Update
                        this.initializeLanguagesPicker();
                    } else {
                        this.initializeLanguagePickerForCreate();
                    }

                    this.languagesPickerInitialized = true;
                }

                // Set controls to inital state 
                // (should also initiate a languages data source request)
                this.SelectLanguagesSubApp.LanguagesFilterTextBox.set("text", "");
                this.LanguagePicker.show();
            }
        },

        addSpansToLanguagesTab: function () {
            var languagesCountSpan = document.getElementById("languagesCountSpan");

            if (languagesCountSpan === null) {
                $("li[data-tab-id=\\{B54AC923-D4D6-4919-9E3A-24B783A456DE\\}] > a").append("<span id=\"languagesCountSpan\" class=\"badge\"></span>");
            }
        },

        languagesCountChanged: function () {
            var languagesItemCount = this.SelectLanguagesSubApp.SelectLanguagesDataSource.get("totalItemCount");
            $("li[data-tab-id=\\{B54AC923-D4D6-4919-9E3A-24B783A456DE\\}] > a > span").html(languagesItemCount);
        },

        // Open / Close Panel Events
        openFilterPanel: function () {
            if (this.FilterPanel.get("isOpen")) {
                this.closeFilterPanel();
            }
            else {
                this.FilterPanel.set("isOpen", true);
            }
        },

        closeFilterPanel: function () {
            this.FilterPanel.set("isOpen", false);
        },

        deactivateFilter: function () {
            if (!this.FilterPanel.get("isOpen")) {
                var filter = this.SearchActionControl.get("actions")[0];

                if (filter.isActive()) {
                    this.SearchActionControl.viewModel.toggleActive(filter);
                }
            }
        },

        addRendererFieldsToObject: function (mask, arrayOfMetadata) {
            var enumerableFromControls = Enumerable.From(this.Controls);

            for (var i = 0; i < arrayOfMetadata.length; i++) {
                var currentItem = arrayOfMetadata[i];
                var fieldControl = enumerableFromControls.Where(function (x) { return x.name == currentItem[1] }).ToArray();
                if (fieldControl.length > 0) {
                    var ctrl = fieldControl[0];
                    var text = ctrl.model.attributes[currentItem[2]];
                    if (typeof (text) == 'string') {
                        mask[currentItem[0]] = ctrl.model.attributes[currentItem[2]].trim();
                    } else {
                        mask[currentItem[0]] = ctrl.model.attributes[currentItem[2]];
                    }
                }
            }
        },

        getItemPickerSelectedProducts: function () {
            var selectedProducts = [];
            var selectedProductListItems = this.PickerPageSubApp.itemPickerSelectedProducts;

            for (i = 0; i < selectedProductListItems.length; i++) {
                var product = {};
                product.itemId = selectedProductListItems[i].itemId;
                product._displayname = selectedProductListItems[i]._displayname;
                product.pendingOperation = "Add";
                product.catalogName = selectedProductListItems[i].catalogname;
                product.catalogDisplayName = selectedProductListItems[i].catalogdisplayname;
                product.name = selectedProductListItems[i].name;
                selectedProducts[i] = product;
            }

            return selectedProducts;
        },

        getItemPickerSelectedCategories: function () {
            var selectedCategories = [];
            var selectedCategoriesListItems = this.PickerPageSubApp.itemPickerSelectedCategories;

            for (i = 0; i < selectedCategoriesListItems.length; i++) {
                var category = {};
                category.itemId = selectedCategoriesListItems[i].itemId;
                category._displayname = selectedCategoriesListItems[i]._displayname;
                category.pendingOperation = "Add";
                category.catalogName = selectedCategoriesListItems[i].catalogname;
                category.catalogDisplayName = selectedCategoriesListItems[i].catalogdisplayname;
                category.name = selectedCategoriesListItems[i].name;
                selectedCategories[i] = category;
            }

            return selectedCategories;
        },

        getItemPickerSelectedCatalogs: function () {
            var selectedCatalogs = [];
            var selectedCatalogsListItems = this.PickerPageSubApp.itemPickerSelectedCatalogs;

            for (i = 0; i < selectedCatalogsListItems.length; i++) {
                var catalog = {};
                catalog.itemId = selectedCatalogsListItems[i].itemId;
                catalog._displayname = selectedCatalogsListItems[i]._displayname;
                catalog.pendingOperation = "Add";
                selectedCatalogs[i] = catalog;
            }

            return selectedCatalogs;
        },

        getItemPickerSelectedVariants: function () {
            var selectedVariants = [];
            var selectedVariantListItems = this.PickerPageSubApp.itemPickerSelectedVariants;

            for (i = 0; i < selectedVariantListItems.length; i++) {
                var variant = {};
                variant.itemId = selectedVariantListItems[i].itemId;
                variant._displayname = selectedVariantListItems[i]._displayname;
                variant.pendingOperation = "Add";
                selectedVariants[i] = variant;
            }

            return selectedVariants;
        },

        closeBaseUrlWindow: function () {
            this.BaseUrlMediaDialogWindow.hide();
        },

        acceptBaseUrlMedia: function () {

            var imageUrl = this.BaseUrlTextBox.get("text");
            var img = this.BaseUrlThumbNail.viewModel.$el.attr("src");
            var images = this.CommerceImages.get("images");
            if (img.indexOf("image_not_found.jpg") == -1) {
                if (imageUrl !== "") {
                    if (images.indexOf(imageUrl) == -1) {
                        this.CommerceImages.set("images", this.CommerceImages.get("images").concat('|' + this.BaseUrlTextBox.get("text")));
                    }
                }
            }

            this.setPageIsDirty(true);
            this.BaseUrlMediaDialogWindow.hide();
        },
        updateBaseUrlPreview: function () {
            var newUrl = this.previousElementSibling.textContent + this.value;
            this.parentElement.children[2].onerror = function () { this.parentElement.children[2].src = "/sitecore/shell/client/Applications/MerchandisingManager/Assets/Icons/48x48/image_not_found.jpg"; };
            this.parentElement.children[2].src = newUrl;
        },

        validateRequiredFields: function (fieldNameArray) {
            var self = this;
            var valid = true;
            $('.isrequired :input').each(function () {
                if (!$(this).val() || $(this).val().length === 0) {
                    $(this).addClass("sc-validation");
                    valid = false;

                    // return the name of the invalidated field in the passed-in array
                    var fieldName = $(this).parent().attr('data-sc-fieldDisplayName');

                    if (!fieldName) {
                        // Some inputs belong to our custom renderings (e.g. CommerceDateTime), and therefore nested a level deeper
                        fieldName = $(this).parent().parent().attr('data-sc-fieldDisplayName');
                        if ($.inArray(fieldName, fieldNameArray) == -1) {
                            fieldNameArray.push(fieldName);
                        }
                    } else {
                        fieldNameArray.push(fieldName);
                    }
                }
                if (!valid) {
                    $(".sc-validation").change(function () {
                        self.updateValidationError($(this));
                    });

                    $(".sc-validation.sc-datepicker").click(function () {
                        self.updateValidationError($(this));
                    });
                }
            });
            return valid;
        },

        addInventoryBaseFieldsToPost: function (inventoryDataObject) {
            if (inventoryDataObject) {
                inventoryDataObject.BackorderLimit = this.BackorderLimit.get("text");
                inventoryDataObject.Backorderable = this.Backorderable.get("isChecked");
                inventoryDataObject.ExcessOnHandQuantity = this.ExcessOnHandQuantity.get("text");
                inventoryDataObject.Memo = this.Memo.get("text");
                inventoryDataObject.OnHandQuantity = this.OnHandQuantity.get("text");
                inventoryDataObject.PreorderLimit = this.PreorderLimit.get("text");
                inventoryDataObject.Preorderable = this.Preorderable.get("isChecked");
                inventoryDataObject.ReorderPoint = this.ReorderPoint.get("text");
                inventoryDataObject.StockOutThreshold = this.StockOutThreshold.get("text");
                inventoryDataObject.TargetQuantity = this.TargetQuantity.get("text");
                inventoryDataObject.UnitOfMeasure = this.UnitOfMeasure.get("text");
                inventoryDataObject.InventoryStatus = this.Status.get("selectedValue");
                inventoryDataObject.LastRestocked = this.LastRestocked.get("value");
                inventoryDataObject.PreorderAvailabilityDate = this.PreorderAvailabilityDate.get("value");
                inventoryDataObject.BackorderAvailabilityDate = this.BackorderAvailabilityDate.get("value");
            }
        },

        parseInventoryDateTextField: function (textField) {
            if (textField) {
                var dateString = textField.get("text");
                if (dateString) {
                    return this.parseInventoryDateString(dateString.trim());
                }
            }

            return null;
        },

        parseInventoryDateString: function (dateString) {
            // Expects date string to be in format mm/dd/yyyy
            var month = dateString.substring(0, 2);
            var day = dateString.substring(3, 5);
            var year = dateString.substring(6);

            return year + month + day;
        },

        getCookie: function (name) {
            return CommerceUtilities.getCookie(name);
        },

        getUsersListViewPreference: function () {
            return CommerceUtilities.getUsersListViewPreference();
        },

        setUsersListViewPreference: function (viewMode) {
            this.listViewMode = viewMode;
            document.cookie = 'listViewMode=' + viewMode;
        },

        checkListViewItems: function (listControl) {
            for (i = 0; i < listControl.get("checkedItemIds").length; i++) {
                var itemId = listControl.get("checkedItemIds")[i];
                var item = listControl.viewModel.$el.find("[id^='" + itemId + "']");
                item.parent().siblings('.sc-cb').attr('checked', 'checked');
            }
        },

        launchSortCategories: function () {
            var targetId = this.get("targetId");
            this.SequenceCategoriesSubApp.SortableCategories.set("commerceItemId", targetId);
            this.SequenceCategoriesSubApp.SortableCategories.set("isReady", true);
            this.SequenceCategoriesSubApp.SortableCategories.refresh();
            this.SequenceCategories.show();
        },

        launchSortProducts: function () {
            var targetId = this.get("targetId");
            this.SequenceProductsSubApp.SortableProducts.set("commerceItemId", targetId);
            this.SequenceProductsSubApp.SortableProducts.set("isReady", true);
            this.SequenceProductsSubApp.SortableProducts.refresh();
            this.SequenceProducts.show();
        },

        launchSortVariants: function () {
            var targetId = this.get("targetId");
            this.SequenceVariantsSubApp.SortableVariants.set("commerceItemId", targetId);
            this.SequenceVariantsSubApp.SortableVariants.set("isReady", true);
            this.SequenceVariantsSubApp.SortableVariants.refresh();
            this.SequenceVariants.show();
        },

        launchSortRelationships: function () {
            var targetId = this.get("targetId");
            this.SequenceRelationshipsSubApp.SortableRelationships.set("commerceItemId", targetId);
            this.SequenceRelationshipsSubApp.SortableRelationships.set("isReady", true);
            this.SequenceRelationshipsSubApp.SortableRelationships.refresh();
            this.SequenceRelationships.show();
        },

        saveSortCategories: function () {
            this.SequenceCategoriesSubApp.saveCategorySequence();
            this.SequenceCategories.hide();
        },

        saveSortProducts: function () {
            this.SequenceProductsSubApp.saveProductSequence();
            this.SequenceProducts.hide();
        },

        saveSortVariants: function () {
            this.SequenceVariantsSubApp.saveVariantSequence();
            this.SequenceVariants.hide();
        },

        saveSortRelationships: function () {
            this.SequenceRelationshipsSubApp.saveRelationshipSequence();
            this.SequenceRelationships.hide();
        },

        showRequiredFieldsMessages: function (fieldNames) {
            var messageBar = null;
            if (this.ErrorsMessageBar) {
                messageBar = this.ErrorsMessageBar;
            } else {
                messageBar = this.HeaderActionsMessageBar;
            }

            messageBar.removeMessages();

            for (i = 0; i < fieldNames.length; i++) {
                var errorMessage = this.ClientErrorMessages.get("The field '{0}' is required");
                errorMessage = errorMessage.replace("{0}", fieldNames[i]);
                messageBar.addMessage("error", errorMessage);
            }

            messageBar.set("isVisible", true);
        },

        addItemsToWorkspace: function (list, page) {
            var self = this;
            var checkedItems = [];
            if (typeof (list) == "string") {
                if (list == "search") {
                    //Uncomment when search is multiselect list
                    checkedItems = self.ProductList.get("checkedItemIds").concat(self.CategoryList.get("checkedItemIds"));
                } else {
                    checkedItems.push(list);
                }
            } else {
                checkedItems = list.get("checkedItemIds");
            }
            self.workspace.addItems(checkedItems, function (data) {
                switch (page) {
                    case "Category":
                        self.CategoryActionControl.getAction("Workspace").counter(data.TotalItemCount);
                        self.ProductActionControl.getAction("Workspace").counter(data.TotalItemCount);
                        self.DetailActionControl.getAction("Workspace").counter(data.TotalItemCount);
                        break;
                    case "Product":
                        self.DetailActionControl.getAction("Workspace").counter(data.TotalItemCount);
                        break;
                    case "CustomCatalog":
                        self.CategoriesActionControl.getAction("Workspace").counter(data.TotalItemCount);
                        self.ProductsActionControl.getAction("Workspace").counter(data.TotalItemCount);
                        break;
                    case "Catalog":
                        self.CategoryActionControl.getAction("Workspace").counter(data.TotalItemCount);
                        self.ProductActionControl.getAction("Workspace").counter(data.TotalItemCount);
                        break;
                    case "Site":
                        self.BaseCatalogActionControl.getAction("Workspace").counter(data.TotalItemCount);
                        self.CustomCatalogActionControl.getAction("Workspace").counter(data.TotalItemCount);
                        break;
                    case "Search":
                        self.ProductActionControl.getAction("Workspace").counter(data.TotalItemCount);
                        self.CategoryActionControl.getAction("Workspace").counter(data.TotalItemCount);
                        self.ProductList.viewModel.uncheckItems(self.ProductList.get("checkedItems"));
                        self.CategoryList.viewModel.uncheckItems(self.CategoryList.get("checkedItems"));
                        break;

                }
                if (data.ItemsAddedCount > 0) {
                    self.HeaderActionsMessageBar.addMessage("notification", data.Message);
                    self.HeaderActionsMessageBar.set("isVisible", true);
                    setTimeout($.proxy(self.hideNotificationMessage, self), 10000);
                }
            });
            if (typeof (list) == "array") {
                list.viewModel.uncheckItems(list.get("checkedItems"));
            }
        },

        getToWorkspace: function () {
            window.location.assign('/sitecore/client/Applications/MerchandisingManager/Workspace');
        },

        setPendingChangesDropDown: function (e) {

            var pendingOperation = e.detail.pendingOperation;
            var selector = e.detail.elementId;

            var oneWayText;
            var twoWayText;

            if (pendingOperation == "Add") {
                oneWayText = this.ClientErrorMessages.get("Add One-Way");
                twoWayText = this.ClientErrorMessages.get("Add Two-Way");
            } else {
                oneWayText = this.ClientErrorMessages.get("Delete One-Way");
                twoWayText = this.ClientErrorMessages.get("Delete Two-Way");
            }

            $(document.getElementById(selector)).append('<option value="0">' + oneWayText + '</option>');
            $(document.getElementById(selector)).append('<option value="1">' + twoWayText + '</option>');

            var id = selector.replace("_select", "").replace("_CrossSell", "").replace("_UpSell", "");

            if (pendingOperation == "Add") {
                var span = selector.replace("_select", "_span");
                var div = selector.replace("_select", "_div");

                $(document.getElementById(selector)).change(function () {
                    var type = $(this).parent().next().attr("title");
                    var match = $.map(cbp.RelationshipsPendingChangesList.get("items"), function (value, index) {
                        if (value.targetItemId == id && value.relationshipName == type) {
                            return value;
                        }
                    });
                    if (this.value == 0) {
                        $(document.getElementById(span)).show();
                        $(document.getElementById(div)).hide();
                        match[0].twoWay = "false";
                    } else {
                        $(document.getElementById(span)).hide();
                        $(document.getElementById(div)).show();
                        match[0].twoWay = "true";
                    }
                });
            } else if (pendingOperation == "Delete") {
                $(document.getElementById(selector)).change(function () {
                    var type = $(this).parent().next().attr("title");
                    var match = $.map(cbp.RelationshipsPendingChangesList.get("items"), function (value, index) {
                        if (value.targetItemId == id && value.relationshipName == type) {
                            return value;
                        }
                    });
                    if (this.value == 0) {
                        match[0].twoWay = "false";
                    } else {
                        match[0].twoWay = "true";
                    }
                });

            }
        },

        serverUpdateTabErrorIndicator: function (controlId) {
            if (!controlId) {
                return;
            }

            var baseContainer = $("[data-sc-id='" + controlId + "']").parents(".bizToolsForms");
            if (baseContainer) {
                var tabId = baseContainer.attr("data-sc-parenttabid");

                if (!tabId) {
                    return;
                }

                tabId = tabId.replace("{", "\\{").replace("}", "\\}");

                var selectorText = "li[data-tab-id=" + tabId + "] > a > label";
                var tabStatusElement = $(selectorText);

                if (tabStatusElement) {
                    tabStatusElement.html("<div class='warning16'>");
                }
            }
        },

        setValueInUserProfile: function (application, area, value) {
            var profilekey = _sc.Helpers.valueOf("sc-userprofilekey");
            var jsonValue = JSON.stringify(value);
            var token = Sitecore.Helpers.antiForgery.getAntiForgeryToken();
            var ajaxToken = {};
            ajaxToken[token.headerKey] = token.value;
            $.ajax({
                type: "POST",
                context: this,
                dataType: "text",
                headers: ajaxToken,
                error: CommerceUtilities.IsAuthenticated,
                data: "application=" + application + "&area=" + area + "&environmentId=" + jsonValue,
                url: "/sitecore/shell/commerce/tools/CommerceEnvironment/SetEnvironmentInProfile"
            });
        },

        getValueInUserProfile: function (callback, application, area) {
            var profilekey = _sc.Helpers.valueOf("sc-userprofilekey");
            var token = Sitecore.Helpers.antiForgery.getAntiForgeryToken();
            var ajaxToken = {};
            ajaxToken[token.headerKey] = token.value;
            $.ajax({
                type: "POST",
                context: this,
                dataType: "text",
                headers: ajaxToken,
                error: CommerceUtilities.IsAuthenticated,
                data: "application=" + application + "&area=" + area,
                url: "/sitecore/shell/commerce/tools/CommerceEnvironment/GetEnvironmentFromProfile",
                success: function (data) {
                    if (typeof (callback) == "function") {
                        callback(data);
                    }
                }
            });
        },

        sendUpdateListPriceRequest: function (currencyCode, price) {
            var catalogName = this.get("catalogName");
            var productId = this.get("productId");
            var variantId = this.get("variantId");
            var environment = this.getSelectedEnvironment();
            var self = this;

            $.ajax({
                url: "/sitecore/shell/commerce/merchandising/SupportCommercePricing/UpdateListPriceForItem",
                type: "POST",
                headers: this.ajaxToken,
                data: {
                    environment: environment,
                    catalogName: catalogName,
                    productId: productId,
                    variantId: variantId,
                    currencyCode: currencyCode,
                    price: price
                },
                context: this,
                error: CommerceUtilities.IsAuthenticated,
                success: function (data) {
                    if (data.Status == "success") {
                        self.ListPriceSavedMessageBar.set("isVisible", true);
                        var pricingDataSource = self.PricingDataSource;
                        if (!pricingDataSource) {
                            pricingDataSource = self.VariantPricingDataSource;
                        }

                        pricingDataSource.refresh();
                        setTimeout(function () { self.ListPriceSavedMessageBar.set("isVisible", false); }, 5000);
                    } else {
                        for (var i = 0; i < data.Errors.length; i++) {
                            self.ErrorsMessageBar.addMessage("error", data.Errors[i]);
                        }

                        self.ErrorsMessageBar.set("isVisible", true);
                        setTimeout(function () { self.ErrorsMessageBar.set("isVisible", false); }, 5000);
                    }
                }
            });
        },

        onUpdateListPriceButtonClicked: function () {
            var pricingListControl = this.PricingListControl;
            if (!pricingListControl) {
                pricingListControl = this.VariantPricingListControl;
            }

            var selectedCurrencyListRow = pricingListControl.get("selectedItem");
            if (!selectedCurrencyListRow) {
                return;
            }

            var rowModel = selectedCurrencyListRow.viewModel;
            var currency = rowModel.Currency();
            var listPrice = rowModel.ListPrice();

            // Set fields in update currency dialog and open it:
            this.UpdateListPriceCurrencyTextBox.set("text", currency);
            this.UpdateListPriceTextBox.set("text", listPrice);

            this.UpdateListPriceDialog.show();
        },

        onUpdateListPriceOKClicked: function () {
            var currency = this.UpdateListPriceCurrencyTextBox.get("text");
            var listPrice = this.UpdateListPriceTextBox.get("text");

            this.sendUpdateListPriceRequest(currency, listPrice);
            this.UpdateListPriceDialog.hide();
        },

        onUpdateListPriceCancelClicked: function () {
            this.UpdateListPriceDialog.hide();
        },

        getSelectedEnvironment: function () {
            var selectedItem = this.EnvironmentsSwitcher.get("selectedItem");
            if (selectedItem != null) {
                return selectedItem.Name;
            }

            return null;
        }
    });

    ko.bindingHandlers.truncatedText = {
        update: function (element, valueAccessor, allBindingsAccessor) {
            var originalText = ko.utils.unwrapObservable(valueAccessor()),
                length = ko.utils.unwrapObservable(allBindingsAccessor().maxTextLength) || 90,
                truncatedText = originalText.length > length ? originalText.substring(0, length) + "..." : originalText;

            ko.bindingHandlers.text.update(element, function () {
                return truncatedText;
            });
        }
    }

    return CommerceBasePage;
});