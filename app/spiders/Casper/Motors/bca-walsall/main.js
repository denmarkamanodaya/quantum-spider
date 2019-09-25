/**
 * Full-Feed Spider
 *
 * This spider type begins to scrape a website from the main search page and
 * then spiders out to each of the different vertical external site details pages to find the
 * relevant data.
 */

var require = patchRequire(require);
var qs = require("../../../../library/js/QS.js");

/**
 * Scrape data navigation object
 *
 * As a spider runs through a site it adds scrape data to this object when they are
 * detected on a search results page. This object is then used to direct the
 * scraping of the scrape data detail from each scrape data page.
 *
 * @type {{links: Array, currentData: number}}
 */
var scrapeData = {
    links: [],
    currentData: 0
};

var location_id;

var getFacetURL =
    "https://auctionview.british-car-auctions.co.uk/buyer/facetedSearch/GetActiveFacetValues?q=&vehicleType=*&currentFacet=salelocation_exact&cultureCode=en";
var getCars =
    "https://auctionview.british-car-auctions.co.uk/buyer/facetedSearch/FilterVehicleResults?q=&bq=salelocation_exact%3A{0}&vehicleType=*&page={1}";
var userName = "paul@bz9.com";
var password = "British2000!";
var locationX = "walsall";

// -----------------------------------------------------------------------------
// Casper initialization
// -----------------------------------------------------------------------------

/**
 * Initialize CasperJS
 */
var casper = qs.getCasper();

/**
 * Initialize any spider event listeners
 */
linkSpiderEventListeners();

casper
    .start(
        "https://auctionview.british-car-auctions.co.uk/Secure/Login.aspx?ReturnUrl=%2fHome"
    )
    .then(function() {
        qs.log("--");
        qs.log("Starting spider run...");

        // Clear previously logged scrape data
        qs.scrapeDataLog.reset();

        /*
            Step 1: Login
        */
        casperThenLoginPage.call(this);

        /*
            Step 3: After gather all the url from catalogue, navigate and scrape lot info
        */
        this.then(function() {
            if (scrapeData.links.length > 0) {
                spiderDetailsPage.call(this);
            }
        });

        /*
            Step 4: finalize and send result to importer via API call
        */
        this.then(function() {
            qs.log("Spider run completed.");
            qs.scrapeDataLog.finalize(this);
            qs.scrapeDataLog.sendResults(this);
        });
    })
    .run();

function casperThenLoginPage() {
    qs.log("Recieved login page. Logging in " + this.getCurrentUrl());

    this.then(function() {
        this.evaluate(
            function(obj) {
                var login_angular = angular.element("form").scope();
                login_angular.form.username.$setViewValue(obj.userName);
                login_angular.form.password.$setViewValue(obj.password);

                login_angular.form.username.$render();
                login_angular.form.password.$render();
            },
            { userName: userName, password: password }
        );
    });

    this.then(function() {
        this.wait(5000, function() {
            this.click('button[translate="LOGIN_TEXT"]');
        });
    });

    this.then(function() {
        this.waitForSelector(
            '[class*="main-search-input"]',
            function() {
                qs.log("Logged in");
            },
            function() {
                qs.log(
                    "Unable to login. Possible issues: credentials mismatch/connection timeout. Please retry"
                );
            }
        ).then(function() {
            getLocations.call(this);
        });
    });
}

function getLocations() {
    qs.log("Getting Locations...");
    this.thenOpen(getFacetURL, { method: "post" })
        .then(function() {
            try {
                var locs = JSON.parse(this.getPageContent()).ActiveFacetValues;

                var location_obj = locs.filter(function(loc) {
                    if (
                        loc.Description.toLowerCase() == locationX.toLowerCase()
                    ) {
                        return true;
                    }
                })[0];

                qs.log("--- " + locationX + " " + JSON.stringify(location_obj));
                if (location_obj) {
                    location_id = location_obj.Description;
                    qs.log(
                        "location details recieved " +
                            JSON.stringify(location_obj, undefined, 4)
                    );
                } else {
                    throw new Error(
                        "Invalid location... Use any of these locations :: \n" +
                            locs
                                .map(function(loc) {
                                    return loc.Description;
                                })
                                .join("\n")
                    );
                }
            } catch (e) {
                showWarning("Error getting locations...", e);
            }
        })
        .then(function() {
            openCataloguesList.call(this);
        });
}

function showWarning() {
    qs.log(Array.prototype.slice.apply(arguments).join(" "));
}

var pageNum = 1;
var totPages;
function openCataloguesList() {
    this.thenOpen(getCars.replace("{0}", location_id).replace("{1}", pageNum), {
        method: "post"
    }).then(function() {
        lotListRecieved.call(this);
    });
}

var months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
];

function getDateStr(lDate) {
    var dateStr = lDate.replace("/Date(", "").replace(")/", "");
    var d = new Date(+dateStr);
    var date = d.getDate();
    if (date.length == 1) {
        date = "0" + date;
    }
    var month = months[d.getMonth()];
    var year = d.getFullYear();
    return date + " " + month + " " + year;
}

function lotListRecieved() {
    var page = JSON.parse(this.getPageContent());
    var lotdata = [];
    if (!totPages) {
        totPages = Math.ceil(page.TotalVehicles / 50);
        qs.log("found " + page.TotalVehicles + " lots");
        lotdata = [];
    }

    for (var x = 0; x < page.VehicleResults.length; x++) {
        var lot = new Lot();
        var clot = page.VehicleResults[x];
        var clotKeys = Object.keys(clot);

        var lotID = clot.LotId;

        lot.setValue(
            "description",
            clot.VehicleInfoHeadline +
                "\n" +
                clot.VehicleInfoColumn1 +
                "\n" +
                clot.VehicleInfoColumn2 +
                "\n" +
                clot.VehicleInfoColumn3 +
                "\n" +
                clot.MobileVehicleInfoColumn +
                "\n" +
                clot.MobileVehicleInfoHeadline +
                "\n" +
                clot.MobileSaleInformation +
                "\n" +
                clot.SaleInformation
        );
        lot.setValue("VehicleInfoColumn1", clot.VehicleInfoColumn1);
        lot.setValue("VehicleInfoColumn2", clot.VehicleInfoColumn2);
        lot.setValue("VehicleInfoColumn3", clot.VehicleInfoColumn3);

        for (var i = 0; i < clotKeys.length; i++) {
            if (clotKeys[i] == "ImageUrl") {
                var images = clot[clotKeys[i]]
                    .substring(2)
                    .replace("width=100", "width=600");

                lot.setValue("images", images);
            } else if (clotKeys[i] == "SaleStartDate") {
                lot.setValue("auction_date", getDateStr(clot[clotKeys[i]]));
            } else if (clotKeys[i] == "SaleEndDate") {
                lot.setValue("auction_date_end", getDateStr(clot[clotKeys[i]]));
            } else {
                lot.setValue(clotKeys[i], clot[clotKeys[i]]);
            }
        }

        lot.fulfill();

        lotdata.push(lot.getLot());
    }

    scrapeData.links = scrapeData.links.concat(lotdata);

    qs.log("Recieved page " + pageNum + ", lots fetched :: " + lotdata.length);
    pageNum++;
    if (pageNum > totPages) {
        qs.log("No more pages to scrape.");
    } else {
        openCataloguesList.call(this);
    }
}

function escapeHTML(value) {
    var map = { amp: "&", lt: "<", gt: ">", quot: '"', "#039": "'", nbsp: " " };
    return value.replace(/&([^;]+);/g, function(f, c) {
        return map[c];
    });
}

function getValueFromObject(object, key) {
    if (key.indexOf(".") != -1) {
        var keys = key.split(".");
        var k = keys[1];
        keys.splice(0, 1);
        return getValueFromObject(object[keys[1]], keys.join("."));
    } else {
        return object[key];
    }
}

var Lot = function() {
    var fields = {
        name: null, //"Auction Title : Required",
        lot_url: null, //"URL For Lot : Required",
        auction_date: null, //"Auction Date : Required unless catalogue auction_date is set",
        description: null, //"Auction Description",
        manufacturer: null, //"Vehicle Make - Usually grabbed from title if not made available : Required",
        model: null, //"Vehicle Model - Usually grabbed from title if not made available : Required",
        registration: null, //"Reg Number/Date : Optional",
        mileage: null, //"Mileage : Optional",
        gearbox: null, //"Manual / Automatic : Optional ",
        fuel: null, //"Fual Type : Optional",
        colour: null, //"Colour : Optional",
        mot: null, //"MOT Date/Info : Optional",
        images: [] //Image Urls array,
    };
    var required_attributes = [
        "name",
        "lot_url",
        "description",
        "manufacturer",
        "model",
        "auction_date"
    ];
    var attribute_map = {
        auction_date: ["{$catalogue}.auction_date"],
        name: ["model", "manufacturer"],
        manufacturer: ["name", "model"],
        model: ["name", "manufacturer"]
    };

    var aliases = {
        viewloturl: "lot_url",
        registrationnumber: "registration",
        registrationdate: "date_of_registration",
        make: "manufacturer",
        colour: "colour"
    };
    var ignoreKeys = [
        "BasicPricing",
        "VehicleId",
        "NoWhiteSpacesRegistrationNumber",
        "IsBCAAssured",
        "IsAAMechanicalReport",
        "HasVideo",
        "LocationCode",
        "Derivative",
        "VatType",
        "CAPClean",
        "CAPAverage",
        "IsTracked",
        "ConditionReportAvailable",
        "CoreSearchComponents",
        "PrintSaleSectionUrl",
        "FullDayCatalogueUrl",
        "BidNow",
        "BuyNow",
        "VIN",
        "MileageWarranty",
        "MileageWarrantyFlag",
        "LotNumber",
        "MechanicalReportAvailable",
        "ConditionReportUrl",
        "MechanicalReportUrl",
        "VehicleType",
        "LotId",
        "FeatureItemLinkUrl",
        "BatchItemsCount",
        "SaleInformationName",
        "MechanicalGrade",
        "CosmeticGrade",
        "TimeOnLiveOnline",
        "TrimLevel",
        "NumberOfBids",
        "VehicleLocation",
        "PowerKw",
        "PowerPs",
        "HasMarketPrice",
        "MarketPriceIndicator",
        "HasLuxuryTax",
        "LuxuryTaxIndicator",
        "IsInBasket",
        "HasBasketIcon",
        "IsUserInShowroom",
        "LotNotes",
        "SuggestedRetailPrice",
        "OptionsPrice",
        "LuxuryTax",
        "TotalPrice",
        "GuidePrice",
        "IsAuctionView",
        "SaleId",
        "SaleName",
        "SaleCountry",
        "SaleType",
        "SaleCurrency",
        "SaleChannel",
        "SalePhase",
        "XbidPhase",
        "SaleFormatter",
        "DocumentOrigin",
        "ViewLotLink",
        "VehicleInfoColumns",
        "GlassRetail",
        "GlassTrade",
        "ShowRegNumber",
        "ViewLotLink",
        "IsStartPrice",
        "SaleHostBrand",
        "ImageUrl",
        "SaleLocation",
        "Imagekey",
        "VehicleInfoHeadline",
        "MobileVehicleInfoColumn",
        "MobileVehicleInfoHeadline",
        "MobileSaleInformation",
        "SaleInformation",
        "SaleDate",
        "SaleStartDate",
        "SaleEndDate"
    ];

    this.setValue = function(field, value) {
        if (ignoreKeys.indexOf(field) != -1) {
            return;
        }
        field = field.trim().toLowerCase();
        if (typeof value == "string") {
            value = value.trim().replace(/\s\s/g, "");
            value = escapeHTML(value);
        }
        if (aliases[field]) {
            fields[aliases[field]] = value;
        } else {
            var field = field.replace(/\s/g, "_");
            fields[field] = value;
        }
    };

    this.getField = function(field_name) {
        return fields[field_name];
    };

    this.getLot = function() {
        return fields;
    };

    this.fulfill = function() {
        for (var i = 0; i < required_attributes.length; i++) {
            var rla = required_attributes[i];
            if (!fields[rla]) {
                var replacable_attributes = attribute_map[rla];
                if (!replacable_attributes) {
                    fields[rla] = "";
                    continue;
                }
                for (var j = 0; j < replacable_attributes.length; j++) {
                    var ra = replacable_attributes[j];
                    var extract = /{\$([a-zA-Z]*)}/g.exec(ra);
                    if (extract) {
                        var index = ra.indexOf(".");
                        ra = ra.substring(index + 1);
                        fields[rla] = getValueFromObject(this[extract[1]], ra);
                    } else {
                        fields[rla] = getValueFromObject(fields, ra);
                    }
                    break;
                }
            }
        }
        fields.name = fields.manufacturer + " " + fields.model;
    };
};

/**
 * Spider the details page
 *
 * This function used the array of collected links provided by `scrapeData.links` and
 * provides the logic needed to "loop" over (via recursion) the different lots.
 */
function spiderDetailsPage() {
    var url, lotData;
    this.then(function() {
        if (scrapeData.links[scrapeData.currentData]) {
            url = scrapeData.links[scrapeData.currentData].lot_url;
            lotData = scrapeData.links[scrapeData.currentData] || {};

            this.then(function() {
                gatherDetails.call(this, url, lotData);
                scrapeData.currentData++;
                this.then(spiderDetailsPage);
            });
        } else {
            qs.log(
                "Total lots found: " +
                    scrapeData.links.length +
                    "; Total lots scraped: " +
                    scrapeData.currentData
            );
        }
    });
}

/**
 * Gather the details page
 *
 * This is where the real data harvesting happens.  This method expects to be
 * ran once we've reached a details page.  It then uses the spider's
 * `parse` method to extract all the needed data.  Extracted
 * data is added to the `lotData` array.
 */
function gatherDetails(url, lotData) {
    this.then(function() {
        lotData = lotData || {};
        var finalUrl = url ? url : this.getCurrentUrl();

        //finalize and format some lotdata
        lotData["colour"] = lotData["vehicleinfocolumn2"].split("@")[0].trim();
        lotData["type"] = lotData["vehicleinfocolumn2"].split("@")[2].trim();

        lotData["gearbox"] = lotData["vehicleinfocolumn3"].split("@")[0].trim();
        lotData["fuel"] = lotData["vehicleinfocolumn3"].split("@")[1].trim();
        lotData["service_history"] = lotData["vehicleinfocolumn1"]
            .split("@")[0]
            .replace("Service History", "")
            .trim();

        lotData["mileage"] = lotData["mileage"].toString();

        if (lotData["images"]) {
            lotData["images"] = lotData["images"].replace(
                "www.",
                "https://www."
            );
        }

        delete lotData.lot_url;
        // Collect job details
        var lotDetails = lotData;

        qs.log(" - Lot: " + finalUrl);

        /*
            Apply some additional standard formatting to the raw lot data
         */
        lotDetails = {
            source: {
                url: finalUrl,
                date: new Date().toUTCString(),
                status: 200
            },
            data: lotDetails
        };

        // Save the lotDetails directly to a file (rather than collect it in memory)
        qs.scrapeDataLog.saveData(lotDetails);
    });
}

function linkSpiderEventListeners() {
    casper.on("resource.requested", function(requestData, request) {
        var skip = [
            "facebook",
            "twitter",
            "cdn.syndication",
            "linkedin",
            "google-analytics",
            "youtube",
            "player-en_US",
            "addthis_widget"
        ];

        skip.forEach(function(needle) {
            if (requestData.url.indexOf(needle) > 0) {
                request.abort();
            }
        });
    });
}
