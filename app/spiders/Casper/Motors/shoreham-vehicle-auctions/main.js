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
    currentData: 0,
    moreLotsExist: true
};

var search = {
    pages: [],
    currentPage: 0
};

var apiData = [];

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

var baseURL = "https://www.shorehamvehicleauctions.com/sales-catalogue.aspx";
var baseApiURL =
    "https://api.shorehamvehicleauctions.com/listingviewmodel?locationid=2&insale=true&saleid=&page=1&pageSize=50&sortBy=lot_asc&make=&model=&derivative=&bodytype=&mileage=0&mileageMax=999999&productGroupId=0&vendor=&vatStatus=";

casper
    .start(baseApiURL)
    .then(function() {
        qs.log("--");
        qs.log("Starting spider run...");

        // Clear previously logged scrape data
        qs.scrapeDataLog.reset();

        /*
            Step 1: Gather all the auction search pages
        */
        gatherAllAuctionPages.call(this);

        /*
            Step 2: Loop through each search pages  and gather all lot links and data
        */
        gatherSearchResultLinks.call(this);

        /*
            Step 3: After gather all the url from catalogue, navigate and scrape lot info
        */
        this.then(function() {
            qs.log("Navigate lots url and scrape data.");
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

function gatherAllAuctionPages() {
    this.then(function() {
        qs.log("Gather All Auction Pages.");
        apiData = this.evaluate(function(baseApiURL) {
            try {
                return JSON.parse(
                    __utils__.sendAJAX(baseApiURL, "GET", null, false)
                );
            } catch (e) {
                return { "error:": e.message };
            }
        }, baseApiURL);

        var pageCnt = parseInt(apiData.PageData.PageCount);

        for (var i = 1; i <= pageCnt; i++) {
            search.pages.push(
                "https://api.shorehamvehicleauctions.com/listingviewmodel?locationid=2&insale=true&saleid=&page=" +
                    i +
                    "&pageSize=50&sortBy=lot_asc&make=&model=&derivative=&bodytype=&mileage=0&mileageMax=999999&productGroupId=0&vendor=&vatStatus="
            );
        }

        qs.log(search.pages.length + " Total number of pages found");
    });
}

function gatherSearchResultLinks() {
    this.then(function() {
        if (search.pages[search.currentPage]) {
            qs.log(
                "There are " +
                    (search.pages.length - search.currentPage - 1) +
                    " more pages of search results to scrape."
            );

            var url = search.pages[search.currentPage];

            apiData = this.evaluate(function(url) {
                try {
                    return JSON.parse(
                        __utils__.sendAJAX(url, "GET", null, false)
                    );
                } catch (e) {
                    return { "error:": e.message };
                }
            }, url);

            this.then(addLinksToScrapeData);

            this.then(function() {
                if (scrapeData.moreLotsExist) {
                    // Increment the current search results page
                    search.currentPage++;

                    // Run this function again until there are no more search results pages
                    this.then(gatherSearchResultLinks);
                }
            });
        }
    });
}

/**
 * Add links
 *
 * This function evaluates the current page and looks for links to the data that
 * need to be scraped.  Scrape data links are added to `scrapeData.links`.  Later on, we will
 * loop through that array to gather the scrape data details from each page.
 */
function addLinksToScrapeData() {
    this.then(function() {
        qs.log("Scraping search results page: " + this.getCurrentUrl());

        var newLinks = getLinks();
        scrapeData.links = scrapeData.links.concat(newLinks);

        qs.log(
            "Found " +
                newLinks.length +
                " links on page. Total to scrape data: " +
                scrapeData.links.length
        );

        if (scrapeData.length === 0) {
            scrapeData.moreLotsExist = false;
        }
    });
}

function appendDescription(desc, desc2) {
    if (desc2 && desc2.length > 0) {
        if (desc && desc.length) {
            return desc + "\n" + desc2;
        }
        return desc2;
    }
    return desc;
}

function getLinks() {
    var links = [];

    links = Array.prototype.map.call(apiData.Listings, function(item) {
        return {
            url:
                "https://www.shorehamvehicleauctions.com/VehicleDetails.aspx?lot=" +
                item.LotNumber +
                "&regno=" +
                item.RegistrationNumber +
                "&sale=" +
                item.SaleCode +
                "&rnum=" +
                item.VehicleReferenceNumber,
            manufacturer: item.Make,
            model: item.Model,
            colour: item.Colour,
            fuel: item.FuelType,
            auction_date: item.SaleDateText,
            vendor: item.VendorName,
            gearbox: item.Transmission,
            v5: item.V5Location,
            body: item.VehicleType,
            name: item.Make + " " + item.Model,
            registration: item.RegistrationNumber,
            registered: item.FirstRegisteredPeriod,
            service_history: item.Remarks,
            mot: item.MOTDate,
            mileage: item.MilageText,
            description: appendDescription(
                appendDescription(
                    appendDescription(item.Description, item.Description2),
                    item.Notes
                ),
                item.MemoDescription
            ),
            images:
                "https://www.shorehamvehicleauctions.com/carimage.vimg?w=130&imageurl=" +
                item.StockImage
        };
    });

    return links;
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
            url = scrapeData.links[scrapeData.currentData].url;
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

        // remove the lot url so that it will not be include in the data object
        delete lotData.url;

        // Collect job details
        var lotDetails = lotData;

        var lotStatus = 200;

        if (this.currentHTTPStatus === 404) {
            qs.log(" - Lot: " + finalUrl + " - Error (HTTP 404)", "ERROR");
        } else if (this.currentHTTPStatus === 500) {
            qs.log(" - Lot: " + finalUrl + " - Error (HTTP 505)", "ERROR");
        } else if (lotDetails && lotDetails._error) {
            qs.log(
                " - Lot: " +
                    finalUrl +
                    " - " +
                    JSON.stringify(lotDetails._error),
                "ERROR"
            );
        } else {
            qs.log(" - Lot: " + finalUrl);
        }

        /*
            Apply some additional standard formatting to the raw lot data
         */
        lotDetails = {
            source: {
                url: finalUrl,
                date: new Date().toUTCString(),
                status: lotStatus
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
            "google",
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
