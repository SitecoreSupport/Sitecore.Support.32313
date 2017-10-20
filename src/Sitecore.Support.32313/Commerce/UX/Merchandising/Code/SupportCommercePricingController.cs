using Newtonsoft.Json.Linq;
using Sitecore.Configuration;
using Sitecore.Diagnostics;
using Sitecore.Exceptions;
using Sitecore.Globalization;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Web.Mvc;
using System.Xml;

namespace Sitecore.Support.Commerce.UX.Merchandising.Code
{
    public class SupportCommercePricingController : Sitecore.Commerce.UX.Merchandising.BusinessController
    {
        private XmlAttributeCollection serviceSettings;

        public SupportCommercePricingController()
        {
            XmlNodeList configNodes = Factory.GetConfigNodes("CommerceEnvironment/ApiService");
            if (configNodes != null)
            {
                this.serviceSettings = configNodes.Item(0).Attributes;
            }
            if (this.serviceSettings == null)
            {
                throw new ConfigurationException("The Commerce Data Service configuration item was not found.");
            }
            if (string.IsNullOrWhiteSpace(this.serviceSettings["DataServiceUrl"].InnerText))
            {
                throw new ConfigurationException("The DataServiceUrl property has not been set in the Commerce Data Service configuration item.");
            }
            if (string.IsNullOrWhiteSpace(this.serviceSettings["ShopName"].InnerText))
            {
                throw new ConfigurationException("The ShopName property has not been set in the Commerce Data Service configuration item.");
            }
        }

        private string RemoveRegionalDecimalFormatting(string formattedValue)
        {
            decimal num;
            CultureInfo culture = Context.Culture;
            if (!decimal.TryParse(formattedValue, NumberStyles.Any, culture, out num))
            {
                return formattedValue;
            }
            // modified part - format has been changed from "N" to "F"
            return num.ToString("F", CultureInfo.InvariantCulture);
        }

        public JsonResult UpdateListPriceForItem(string environment, string catalogName, string productId, string variantId, string currencyCode, string price)
        {
            Assert.IsNotNullOrEmpty(environment, "environment");
            Assert.IsNotNullOrEmpty(catalogName, "catalogName");
            Assert.IsNotNullOrEmpty(productId, "productId");
            Assert.IsNotNullOrEmpty(currencyCode, "currencyCode");
            string innerText = this.serviceSettings["ShopName"].InnerText;
            string str2 = catalogName + "|" + productId + "|";
            if (!string.IsNullOrWhiteSpace(variantId))
            {
                str2 = str2 + variantId;
            }
            string str3 = this.RemoveRegionalDecimalFormatting(price);
            string format = "{{ \"itemId\": \"{0}\", \"prices\": [ {{ \"CurrencyCode\": \"{1}\", \"Amount\": {2} }} ] }}";
            object[] args = new object[] { str2, currencyCode, str3 };
            format = string.Format(CultureInfo.InvariantCulture, format, args);
            Uri requestUri = new Uri(this.serviceSettings["DataServiceUrl"].InnerText + "UpdateListPrices()");
            HttpClient client1 = new HttpClient();
            client1.DefaultRequestHeaders.Accept.Clear();
            client1.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            client1.DefaultRequestHeaders.Add("ShopName", innerText);
            client1.DefaultRequestHeaders.Add("Environment", environment);
            client1.DefaultRequestHeaders.Add("X-ARR-ClientCert", base.GetCertificateString());
            HttpResponseMessage result = client1.PutAsync(requestUri, new StringContent(format, Encoding.UTF8, "application/json")).Result;
            Dictionary<string, object> data = new Dictionary<string, object>();
            List<string> list = new List<string>();
            if (result.IsSuccessStatusCode)
            {
                Dictionary<string, object> dictionary2 = result.Content.ReadAsAsync<Dictionary<string, object>>().Result;
                if (dictionary2.ContainsKey("ResponseCode"))
                {
                    if (((string)dictionary2["ResponseCode"]) == "Ok")
                    {
                        data.Add("Status", "success");
                    }
                    else
                    {
                        data.Add("Status", "error");
                    }
                }
                if (dictionary2.ContainsKey("Messages"))
                {
                    foreach (JToken token in (JArray)dictionary2["Messages"])
                    {
                        string str5 = token["Code"].Value<string>();
                        if (!string.IsNullOrWhiteSpace(str5) && str5.Equals("Error", StringComparison.OrdinalIgnoreCase))
                        {
                            string item = token["Text"].Value<string>();
                            list.Add(item);
                        }
                    }
                    data.Add("Errors", list);
                }
            }
            else
            {
                string str7 = Translate.Text("An unexpected error has occurred.");
                list.Add(str7);
                data.Add("Status", "error");
                data.Add("Errors", list);
            }
            return base.Json(data);
        }
    }
}