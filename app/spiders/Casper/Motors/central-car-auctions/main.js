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

var baseURL = "http://www.centralcarauctions.com/trade/vehicles/";
var baseApiURL =
    "http://www.centralcarauctions.com/Stock/LoadStock?type=car&capMakeId=0&capModelId=0&min=-1&max=-1&mileage=-1&fuzzy=&page=-2&qfLot=&qfRow=&sortBy=unofficial_lot_alt_asc&make=&model=&saleCode=";

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
    .start(baseApiURL)
    .then(function() {
        qs.log("--");
        qs.log("Starting spider run...");

        // Clear previously logged scrape data
        qs.scrapeDataLog.reset();

        getAutoDetail.call(this);

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
        engine_size: null, //"MOT Date/Info : Optional",
        service_history: null,
        images: [] //Image Urls array
    };
    var required_attributes = [
        "name",
        "lot_url",
        "description",
        "manufacturer",
        "model",
        "images",
        "auction_date"
    ];
    var attribute_map = {
        name: ["model", "manufacturer"],
        manufacturer: ["name", "model"],
        model: ["name", "manufacturer"]
    };

    var aliases = {
        registrationnumber: "registration",
        stockimage: "images",
        motdatetext: "mot",
        saledatetext: "auction_date",
        datefirstregisteredtext: "date_first_registered",
        milagetext: "mileage",
        mileagewarrantytext: "mileage_warranty",
        capcleanvalue: "capclean",
        capavgvalue: "cap_avg",
        vehiclevaluetext: "vehicle_value"
    };

    this.setValue = function(field, value) {
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

function appendDescription(desc, desc2) {
    if (desc2 && desc2.length > 0) {
        if (desc && desc.length) {
            return desc + "\n" + desc2;
        }
        return desc2;
    }
    return desc;
}

function getAutoDetail() {
    var apiData = JSON.parse(this.getPageContent());
    var lotdata = [];
    for (var l = 0; l < apiData.StockItems.length; l++) {
        var lot = new Lot();
        var useKeys = [
            "StockImage",
            "Make",
            "Model",
            "Colour",
            "DateTaxed",
            "RegistrationNumber",
            "Odometer",
            "OdometerType",
            "MileageWarranty",
            "VatStatus",
            "SaleDateText",
            "DateFirstRegisteredText",
            "MilageText",
            "MileageWarrantyText",
            "MOTDateText",
            "CapCleanValue",
            "CapAvgValue",
            "GlassesValue",
            "VehicleValueText",
            "Description",
            "Highlight",
            "FormerKeepers",
            "VehicleType",
            "Fuel",
            "FuelType",
            "Remarks",
            "Transmission",
            "ServiceHistory",
            "Timeslot",
            "VehicleReferenceNumber",
            "Reserve",
            "FirstRegisteredPeriod",
            "BidRange",
            "SalesNumber",
            "InSaleToday",
            "YearManufactured",
            "Doors",
            "VendorId",
            "VendorCode",
            "VendorName",
            "CapID",
            "CapCode"
        ];
        var apiLot = apiData.StockItems[l];
        apiLot.Description = appendDescription(
            appendDescription(
                appendDescription(apiLot.Description, apiLot.Description2),
                apiLot.Notes
            ),
            apiLot.MemoDescription
        );
        var keys = Object.keys(apiLot);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var val = apiLot[key];
            if (useKeys.indexOf(key) == -1) {
                continue;
            }
            if (key == "VehicleReferenceNumber") {
                key = "lot_url";
                val =
                    "http://www.centralcarauctions.com/trade/vehicles/details/" +
                    val;
            }
            if (key == "StockImage") {
                val = ["http://www.centralcarauctions.com/i_folder/" + val];
            }

            if (key == "VehicleValueText") {
                val = val
                    .replace("C:", "")
                    .replace("G:", "")
                    .trim();
            }

            if (key == "ServiceHistory") {
                key = "service_history";
                val = val;
            }

            if (key != "" && val != "" && val != null) {
                lot.setValue(key, val);

                if (key == "Model") {
                    key = "engine_size";
                    var engineSize = val.split("-");
                    val = engineSize[engineSize.length - 1].trim();
                    lot.setValue(key, val);
                }
            }
		
	    if(key == "SaleDateText")
	    {
		var date_str = val;
		var date_dirty = (date_str.split(" ")[0]).split("/");
		var dirty_year = ("20" + date_dirty[2].slice(-2));
		var clean_date = dirty_year + "-" + date_dirty[1] + "-" + date_dirty[0];
		lot.setValue(key, clean_date);
	    }
        }
        lot.fulfill();
        lotdata.push(lot.getLot());
    }

    scrapeData.links = scrapeData.links.concat(lotdata);

    qs.log("Lots fetched :: " + lotdata.length);
}

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

        delete lotData.url;
        //finalize and format some lotdata
        if (lotData["vehicletype"])
            lotData["type"] = lotData["vehicletype"].trim();

        if (lotData["transmission"])
            lotData["gearbox"] = lotData["transmission"].trim();

        if (lotData["make"]) lotData["manufacturer"] = lotData["make"].trim();

        if (lotData["images"]) lotData["images"] = lotData["images"].join(", ");

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
