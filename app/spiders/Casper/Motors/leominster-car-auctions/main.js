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
    .start("http://www.leominstercarauctions.co.uk/stock-list.aspx?Page=1")
    .then(function() {
        qs.log("--");
        qs.log("Starting spider run...");

        // Clear previously logged scrape data
        qs.scrapeDataLog.reset();

        /*
            Step 1: Gather all the auction pages links that we need to scrape
        */
        gatherAuctionPages.call(this);

        /*
            Step 2: Gather all the search results links that we need to scrape from each pages
        */
        gatherSearchResultLinksFromPages.call(this);

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

function gatherAuctionPages() {
    this.waitForSelector('[class="stocklist-container"]', function() {
        qs.log("Gather all auction search result pages.");

        search.pages = this.evaluate(function(currentURL) {
            var pages = [];
            var total = document
                .querySelector('[class="rightside"] h3')
                .innerText.split("of")[1]
                .split("Results")[0]
                .trim();
            var total_pages = Math.ceil(parseInt(total) / 10);

            for (var i = 1; i <= total_pages; i++) {
                pages.push(
                    "http://www.leominstercarauctions.co.uk/stock-list.aspx?Page=" +
                        i
                );
            }

            return pages;
        });

        casper.then(function() {
            qs.log(search.pages.length, "Total number of pages found");
        });
    });
}

function gatherSearchResultLinksFromPages() {
    qs.log(
        "There are " +
            (search.pages.length - search.currentPage) +
            " more pages of search results to scrape."
    );

    this.then(function() {
        if (search.pages[search.currentPage]) {
            this.thenOpen(search.pages[search.currentPage]);

            // to ensure the page will completely load
            var afterWait = function() {
                // Collect all the links to lots on that page
                this.then(addLinksToScrapeData);

                this.then(function() {
                    // Increment the current search results page
                    search.currentPage++;

                    // Run this function again until there are no more search results pages
                    this.then(gatherSearchResultLinksFromPages);
                });
            };

            this.then(function() {
                this.waitForSelector(
                    '[class="stocklist-container"]',
                    afterWait
                );
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

        newLinks = this.evaluate(getLinks);
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

    var elem = document.querySelectorAll('li a[href*="stock-detail.aspx?"]');
    for (var i = 0; i < elem.length; i++) {
        var lotlink = elem[i].href;
        links.push({
            url: lotlink,
            name: elem[
                i
            ].parentNode.parentNode.parentNode.parentNode.querySelector("h3")
                .innerText
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
                this.waitForSelector('[class="stockdetails"]', afterWait);
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

        var details = {};
        var elem = document.querySelectorAll('[class="right"] li');
        for (var indx = 0; indx < elem.length; indx++) {
            if (elem[indx].innerText.split("-").length > 1) {
                var header = elem[indx].innerText.split("-")[0].trim();
                var value = elem[indx].innerText.split("-")[1].trim();

                details[header] = value;
            }
        }

        if (details["Year"]) {
            lot["manufacturer"] = details["Year"];
        }

        if (details["Body"]) {
            lot["type"] = details["Body"];
        }

        if (details["Miles"]) {
            lot["mileage"] = details["Miles"];
        }

        if (details["MOT"]) {
            lot["mot"] = details["MOT"];
        }

        if (details["Warranty"]) {
            lot["warranty"] = details["Warranty"];
        }

        var desc = "";
        var descElem = document.querySelectorAll('[class="right"] p');
        for (var x = 0; x <= 1; x++) {
            desc += "<br/><br/>" + descElem[x].innerHTML.trim();
        }

        lot["description"] = escapeHTML(desc);

        lot["lot_num"] = document.querySelector('[class="right"] h3').innerText;
        lot["auction_date"] = document
            .querySelector('[class="lastupdate"]')
            .innerText.split("Last stock update:")[1]
            .trim();

        lot["images"] = [].slice
            .call(
                document.querySelectorAll(
                    "#ContentPlaceHolder1_thumbImages a"
                )
            )
            .map(function(a) {
                return a.href;
            })
            .filter(function(item, pos, self) {
                return self.indexOf(item) == pos;
            })
            .join(", ");

        lot = jQuery.extend({}, lot, lotData);
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
