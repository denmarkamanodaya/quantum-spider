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

var search = {
    pages: [],
    currentPage: 0
};

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
        "https://auctions.motorhog.co.uk/vehicle-list/?type=9&make=&trns=0&fuel=0&catc=0&memr=26&site=&dist=0&sort=0&srch="
    )
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
        search.pages = casper.evaluate(function() {
            var pages = [];
            var total = document
                .querySelector('[class="pagination_numbers hide_mobile"]')
                .innerText.trim();
            total = total.match(/of (\d+)/)[1].trim();

            for (var i = 1; i <= total; i++) {
                pages.push(
                    "https://auctions.motorhog.co.uk/vehicle-list/?type=9&memr=26&make=&trns=0&fuel=0&catc=0&dist=0&sort=0&srch=&page=" +
                        i
                );
            }

            return pages;
        });

        casper.then(function() {
            qs.log(search.pages.length + " Total number of pages found");
        });
    });
}

function gatherSearchResultLinks() {
    this.then(function() {
        qs.log(
            "There are " +
                (search.pages.length - search.currentPage) +
                " more pages of search results to scrape."
        );
        if (search.pages[search.currentPage]) {
            // Navigate search page url
            this.thenOpen(search.pages[search.currentPage]);

            this.then(function() {
                // To ensure the page will completely load
                var afterWait = function() {
                    // Collect all the links to scrape data on the page
                    addLinksToScrapeData.call(this);

                    this.then(function() {
                        // Increment the current search results page
                        search.currentPage++;

                        // Run this function again until there are no more catalogues
                        this.then(gatherSearchResultLinks);
                    });
                };

                this.then(function() {
                    this.waitForSelector("#vl_results", afterWait);
                });
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

        var newLinks = this.evaluate(getLinks);

        scrapeData.links = scrapeData.links.concat(newLinks);

        qs.log(
            "Found " +
                newLinks.length +
                " links on page. Total to scrape data: " +
                scrapeData.links.length
        );
    });
}

function getLinks() {
    var links = [];

    var elem = document.querySelectorAll(
        '[class="vehicle_list_title"] a[href*="/vehicle-list/details/"]'
    );
    for (var i = 0; i < elem.length; i++) {
        var lotlink = elem[i].href;
        links.push({
            url: lotlink
        });
    }

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

            this.thenOpen(url);

            // to ensure the page will completely load
            var afterWait = function() {
                // Collect all the lot data on that page
                this.then(function() {
                    gatherDetails.call(this, url, lotData);
                    scrapeData.currentData++;
                    this.then(spiderDetailsPage);
                });
            };

            this.then(function() {
                this.waitForSelector(
                    '[class="details_vehicle_title"]',
                    afterWait
                );
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

        // Collect job details
        var lotDetails = this.evaluate(parse, lotData);

        var lotStatus = this.currentHTTPStatus;

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

function parse(lotData) {
    lot = {};

    try {
        function escapeHTML(value) {
            var map = {
                amp: "&",
                lt: "<",
                gt: ">",
                quot: '"',
                "#039": "'",
                nbsp: " "
            };
            return value.replace(/&([^;]+);/g, function(f, c) {
                return map[c];
            });
        }

        // remove the lot url so that it will not be include in the data object
        delete lotData.url;

        var name = document
            .querySelector('[class="details_vehicle_title"]')
            .innerText.trim();

        lot["name"] = name;

        //fuel
        if (name.indexOf("petrol") > -1 || name.indexOf("Petrol") > -1) {
            lot["fuel"] = "Petrol";
        } else if (name.indexOf("diesel") > -1 || name.indexOf("Diesel") > -1) {
            lot["fuel"] = "Diesel";
        }

        var details = {};
        var elem = document.querySelectorAll('span[class="info_title"]');

        for (var indx = 0; indx < elem.length; indx++) {
            var header = elem[indx].innerText.trim();
            var value = elem[indx].nextElementSibling.innerText.trim();
            details[header] = value;
        }

        lot["manufacturer"] = name;
        lot["model"] = name;

        if (details["Reg"]) {
            lot["registration"] = details["Reg"];
        }

        if (details["Speedo (View important info)"]) {
            lot["mileage"] = details["Speedo (View important info)"];
        }

        if (details["Body shape"]) {
            lot["type"] = details["Body shape"];
        }

        if (details["Service history (View important info)"]) {
            lot["service_history"] =
                details["Service history (View important info)"];
        }

        if (details["Colour"]) {
            lot["colour"] = details["Colour"];
        }

        lot["estimate"] = document
            .querySelector('[class="price_details"]')
            .innerText.trim();

        lot["auction_date"] = document
            .querySelector('[class="closing_details"]')
            .innerText.trim();

        lot["description"] = escapeHTML(details["Description"]);

        var images = [];
        for (var item = 0; item < swipelist.length; item++) {
            images.push(swipelist[item].src);
        }

        lot["images"] = images
            .filter(function(item, pos, self) {
                return self.indexOf(item) == pos;
            })
            .join(", ");
    } catch (err) {
        lot["_error"] = err.message;
    }

    return lot;
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

    casper.on("resource.requested", function(requestData, request) {
        if (!(requestData.url.indexOf("auctions.motorhog.co.uk") > -1)) {
            request.abort();
        }
    });
}
