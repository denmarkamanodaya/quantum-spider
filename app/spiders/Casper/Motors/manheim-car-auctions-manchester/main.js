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

var loginURL = "https://www.manheim.co.uk/";
var host = "https://www.manheim.co.uk";
var getFacetURL = "https://www.manheim.co.uk/events/getFacet";
var gridEventsURL = "https://www.manheim.co.uk/events/gridevents";
var refineURL = "https://www.manheim.co.uk/search/refine";
var imagePrepURL = "https://images.manheim.co.uk/images/units/zoom/";
var userName = "support@gaukmedia.com";
var password = "GAUKMotors1234!";

var locationX = "Manchester";
var privateContent = true;

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
    .start(loginURL)
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
                document.querySelector(
                    ".login-form__container .js-login-form #Email"
                ).value = obj.userName;
                document.querySelector(
                    ".login-form__container .js-login-form #Password"
                ).value = obj.password;
            },
            { userName: userName, password: password }
        );
    });

    this.then(function() {
        this.waitForSelector(
            ".login-form__container input[type='submit']"
        ).thenClick(".login-form__container input[type='submit']");
    });

    this.then(function() {
        this.waitForSelector(
            ".js-mm-open",
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
    this.thenOpen(getFacetURL, {
        method: "post",
        data: {
            "Request.GridPage": 1,
            "Request.CalendarPage": 1,
            facetToLoad: "Location"
        }
    })
        .then(function() {
            try {
                var locs = JSON.parse(this.getPageContent()).Locations;

                location_obj = locs.filter(function(loc) {
                    if (loc.Text.toLowerCase() == locationX.toLowerCase()) {
                        return true;
                    }
                })[0];

                qs.log("--- " + locationX + " " + JSON.stringify(location_obj));
                if (location_obj) {
                    location_id = location_obj.Value;
                    qs.log(
                        "location details recieved " +
                            JSON.stringify(location_obj, undefined, 4)
                    );
                } else {
                    throw new Error(
                        "Invalid location... Use any of these locations :: \n" +
                            locs
                                .map(function(loc) {
                                    return loc.Text;
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

function openCataloguesList(pageNum) {
    this.thenOpen(gridEventsURL, {
        method: "post",
        data: {
            "Request.IsEventsICanAttend": true,
            "Request.GridPage": pageNum ? pageNum : 1,
            "Request.CalendarPage": 1,
            "Request.Locations": location_id ? location_id : undefined
        }
    }).then(function() {
        catalogueListRecieved.call(this);
    });
}

var catKeys,
    currCat = 0,
    catPage = 1;
var cataloguePages;
var catalogues = [];
function catalogueListRecieved() {
    var catalogueData = JSON.parse(this.getPageContent());
    if (!cataloguePages) {
        cataloguePages = catalogueData.TotalPages;
        qs.log("found " + cataloguePages + " catalogue pages");
    }
    catalogueResults = catalogueData.Results;
    for (var i = 0; i < catalogueResults.length; i++) {
        var catalogue = {
            catalogue_url: host + catalogueResults[i].ListingUrl,
            auction_date:
                catalogueResults[i].StartDate.FullDateFormatted +
                ", " +
                catalogueResults[i].StartDate.TimeFormatted,
            id: catalogueResults[i].Id,
            hasLots: catalogueResults[i].VehiclesCount > 0,
            lots: []
        };

        catalogues[catalogue.catalogue_url] = catalogue;
    }
    qs.log(
        "catalogue list recieved for page " +
            catalogueData.CurrentPage +
            " Current catalogue count " +
            Object.keys(catalogues).length
    );

    catKeys = Object.keys(catalogues);

    //qs.log(JSON.stringify(catalogues));
    openCataloguePage.call(this);
}

function getCurrentCat() {
    return catalogues[catKeys[currCat]];
}

function openCataloguePage() {
    var cat = getCurrentCat();
    if (!cat) {
    } else if (cat.hasLots) {
        this.thenOpen(refineURL, {
            method: "post",
            data: {
                "Request.SortBy": "LotNumber",
                "Request.SortAscending": "True",
                "Request.SaleEventId": cat.id,
                "Request.Page": catPage,
                "Request.PageSize": 100,
                "Request.Referrer": "/catalogues-and-events/listing/" + cat.id
            }
        }).then(function() {
            cataloguePageRecieved.call(this);
        });
    } else {
        qs.log(
            currCat +
                1 +
                "/" +
                catKeys.length +
                " ::  catalog empty" +
                cat.catalogue_url
        );
        currCat++;
        catPage = 1;
        openCataloguePage.call(this);
    }
}

function cataloguePageRecieved() {
    var lotData = { Results: [] };
    var cat = getCurrentCat();

    lotData = JSON.parse(this.getPageContent());

    for (var x = 0; x < lotData.Results.length; x++) {
        var lot = new Lot(cat);
        var clot = lotData.Results[x];
        var clotKeys = Object.keys(clot);

        for (var i = 0; i < clotKeys.length; i++) {
            if (clotKeys[i] == "ImageThumbnail") {
                if (privateContent) {
                    var imgs = clot[clotKeys[i]];
                    if (imgs) {
                        var th = imgs.replace("ims_tiny", "zoom");
                        imgs = [th];
                        var imgName = th.split("/");
                        imgName = imgName[imgName.length - 1];
                        var othId = imgName.split("-");
                        othId = othId[othId.length - 2];

                        var names = imgName.split("-");
                        var ln = names[names.length - 1].split(".");
                        var ext = ln[1];
                        var fname = "";
                        names.splice(names.length - 1, 1);
                        fname = names.join("-");
                        for (var j = 0; j < 30; j++) {
                            var fx = "";
                            if (j.toString().length == 1) {
                                fx += "-00" + j;
                            } else {
                                fx += "-0" + j;
                            }
                            fx += "." + ext;
                            if (imgs.indexOf(imagePrepURL + fname + fx) == -1) {
                                imgs.push(imagePrepURL + fname + fx);
                            }
                        }
                    } else {
                        imgs = [];
                    }
                    lot.setValue("images", imgs);
                }
            } else if (clotKeys[i] == "VehicleDetailPageUrl") {
                lot.setValue("lot_url", host + clot[clotKeys[i]]);
            } else {
                lot.setValue(clotKeys[i], clot[clotKeys[i]]);
            }
        }

        lot.fulfill();
        lotData.Results[x] = lot.getLot();

        //qs.log(JSON.stringify(lotData));
    }

    catalogues[catKeys[currCat]].lots.push.apply(
        catalogues[catKeys[currCat]].lots,
        lotData.Results
    );

    scrapeData.links = scrapeData.links.concat(
        catalogues[catKeys[currCat]].lots
    );

    if (lotData.Pager.LastPage == lotData.Pager.CurrentPage) {
        qs.log(
            currCat +
                1 +
                "/" +
                catKeys.length +
                " ::  found " +
                catalogues[catKeys[currCat]].lots.length +
                " lots in catalogue " +
                cat.catalogue_url
        );

        currCat++;
        catPage = 1;
        openCataloguePage.call(this);
    } else {
        qs.log(
            currCat +
                1 +
                "/" +
                catKeys.length +
                " ::  found " +
                catalogues[catKeys[currCat]].lots.length +
                " lots in catalogue " +
                cat.catalogue_url +
                " has more lots. Fetching..."
        );
        catPage++;
        openCataloguePage.call(this);
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

var Lot = function(catalogue) {
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
        images: [] //Image Urls array
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
        registrationplate: "registration",
        motexpiry: "mot",
        fueltype: "fuel",
        transmission: "gearbox",
        dateofregistrationiso: "date_of_registration",
        vehicledetailpageurl: "lot_url",
        yearofmanufacture: "manufactured"
    };
    var ignoreKeys = [
        "SalesChannel",
        "SourceModel",
        "Derivative",
        "EngineCapacityLitres",
        "Transmission",
        "Grade",
        "Certifications",
        "BodyColour",
        "InteriorColour",
        "DateOfRegistrationValue",
        "DateOfRegistration",
        "CAPRetailPrice",
        "CAPCleanPrice",
        "CAPAveragePrice",
        "GlassTradePrice",
        "ManheimValuationPrice",
        "IsOdometerWarranted",
        "Location",
        "Watched",
        "Bid",
        "AnyBidsPlaced",
        "SaleEventId",
        "SaleEventListingId",
        "IsPreviewStock",
        "InLaneLocation",
        "InLaneEventStartDate",
        "AuctionCentre",
        "VehicleLocation",
        "AllowBiddingBeforeStart",
        "VCar",
        "Runner",
        "Imported",
        "InLaneEventStartDateFormatted",
        "IsReserveNotMet",
        "IsBidOnly",
        "IsBuyNowOnly",
        "IsBid",
        "IsBuyNow",
        "BuyNowPrice",
        "BuyNowPriceFormatted",
        "HighestBidValue",
        "OnlinePrice",
        "OnlinePriceFormatted",
        "OnlineTimeLeft",
        "SaleEventListingEndDateIso",
        "PriceColour",
        "IsRed",
        "IsBlue",
        "IsOrange",
        "IsGreen",
        "IsDefault",
        "ListingFate",
        "IsValidToDisplayOnFating",
        "IsEventStarted",
        "IsBidHigherThanBuyNow",
        "ShowBidAndBuyButton",
        "IsBidAndBuyAuction",
        "IsNotEventEnded",
        "FatingMessage",
        "IsValidToDisplayFateMessage",
        "IsFatingMessageEmpty",
        "IsMyAccountVehicle",
        "IsMyVehicle",
        "VATQualifing",
        "V5",
        "Specification",
        "SaleEvents",
        "ConditionReportUrl",
        "Vendor",
        "SaleEventsExist",
        "SellingEventsText",
        "BiddingStatusMaxBid",
        "BiddingStatusLabel",
        "BiddingStatusIsWinner",
        "BiddingStatusIsOutbid",
        "BiddingStatusIsProxyBid",
        "BiddingStatusIsOnlineBid",
        "SaleEventVendorGvcCodes",
        "AuctionCentreUrl",
        "ManheimValuationSampleSize",
        "ManheimValuationMileage",
        "InLaneLocationUrl",
        "TrackingData",
        "HasBidAndBuyInfoAccess",
        "ShowCurrentBidLabel",
        "HasImage360",
        "HasBeautyImages",
        "IsPartnerSelection",
        "PartnerSelection"
    ];
    this.catalogue = catalogue;
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
                if (url) {
                    gatherDetails.call(this, url, lotData);
                    scrapeData.currentData++;
                    this.then(spiderDetailsPage);
                } else {
                    scrapeData.currentData++;
                    this.then(spiderDetailsPage);
                }
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
        lotData["type"] = lotData["vehicletype"];

        lotData["mileage"] = lotData["odometer"];
        try {
            lotData["images"] = lotData["images"].join(", ");
        } catch (err) {
            lotData["images"] = lotData["images"];
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
