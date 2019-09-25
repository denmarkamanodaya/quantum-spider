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

var auctionIdx = 0;
var auction_urls = [];

//var search = {};

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
    .start("https://www.astonbarclay.net/auction-schedule/")
    .then(function() {
        qs.log("--");
        qs.log("Starting spider run...");

        // Clear previously logged scrape data
        qs.scrapeDataLog.reset();

        /*
            Step 1: Gather all the catalogue links that we need to scrape
        */
        gatherAllAuctionLinks.call(this);

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

function gatherAllAuctionLinks() {
    this.then(function() {
        qs.log("Gather All Catalogue Links if any.");
        this.waitForSelector(
            '[class*="azItem aucItem"]',
            function() {
                auction_urls = this.evaluate(function() {
                    var auction_urls_temp = [];
                    var elem = document.querySelectorAll('[class*="aucItem"]');

                    for (var x = 0; x < elem.length; x++) {
                        var auction_name = elem[x]
                            .querySelector('h2[class="name"]')
                            .innerText.trim();

                        if (
                            auction_name.toLowerCase().indexOf("chelmsford") !=
                            -1
                        ) {
                            auction_urls_temp.push({
                                url: elem[x]
                                    .querySelector(
                                        '[href*="/vehicle-search/?search"]'
                                    )
                                    .href.trim()
                            });
                        }
                    }

                    return auction_urls_temp;
                });

                this.then(function() {
                    qs.log(auction_urls.length + " catalogues/auctions found");
                    /*
                        Step 2: Loop through each auctions links and gather all the search results pages and lot links
                    */
                    processAuction.call(this);
                });
            },
            function _onTimeout() {
                qs.log("No record on the page" + this.getCurrentUrl());
            }
        );
    });
}

function processAuction() {
    if (auctionIdx < auction_urls.length) {
        search = {
            pages: [],
            currentPage: 0
        };

        qs.log("Navigate " + auction_urls[auctionIdx].url);
        this.thenOpen(auction_urls[auctionIdx].url);

        this.then(function() {
            this.wait(6000);
            gatherSearchPages.call(this);
        });

        this.then(function() {
            this.wait(5000);
            gatherSearchResultLinks.call(this);
        });
    }
}

function gatherSearchPages() {
    qs.log("Gather Search Pages From Every Auctions.");
    this.waitForSelector('[class="page-link"][aria-label="Next"]', function() {
        this.then(function() {
            search.pages = this.evaluate(function() {
                var pages = [];
                var totalLots = document
                    .querySelector('h2[class*="p-0 m-0"]')
                    .innerText.split("-")[1]
                    .split("Matches")[0]
                    .trim();
                var pagesCnt = Math.ceil(totalLots / 12);
                for (var i = 1; i <= pagesCnt; i++) {
                    pages.push('[class="page-link"][aria-label="Next"]');
                }

                return pages;
            });
        });

        this.then(function() {
            qs.log(search.pages.length);
            if (search.pages.length > 0) {
                qs.log(search.pages.length + " Total number of pages found");
                this.then(addLinksToScrapeData);
            } else {
                search.pages = [];
                qs.log("No Results Found!");
                auctionIdx++;
                processAuction.call(this);
            }
        });
    });
}

function gatherSearchResultLinks() {
    this.then(function() {
        if (search.pages[search.currentPage + 1]) {
            qs.log(
                "There are " +
                    (search.pages.length - search.currentPage - 1) +
                    " more pages of search results to scrape."
            );

            var nextPageElem = search.pages[search.currentPage + 1];

            // Navigate catalogue url
            this.click(nextPageElem);

            this.then(function() {
                // To ensure the page will completely load
                var afterWait = function() {
                    // Collect all the links to scrape data on the page
                    addLinksToScrapeData.call(this);


			qs.log(this);

                    this.then(function() {
                        // Increment the current search results page
                        search.currentPage++;

                        // Run this function again until there are no more catalogues
                        this.then(gatherSearchResultLinks);
                    });
                };

                this.then(function() {
                    this.waitForSelector(
                        //'[href*="/vehicle-search/vehicle-details/"]',
			             '[href*="/details/catalogue/"]',
                        afterWait
                    );
                });
            });
        } else {
            auctionIdx++;
            processAuction.call(this);
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
    var elem = document.querySelectorAll('[href*="/details/catalogue/"]');
    
    for(var i = 0; i < elem.length; i++)
    {
	var lotInfo = elem[i].querySelector('[class*="ab-card-aution-details"]').innerText;

	var lotnum = "";
	try
	{
		var lotnum = lotInfo
			.split("|")[0]
			.split("lot:")[1]
			.trim();
	}catch(err){}

	var auctionDate = lotInfo
	    		.split("|")[2]
	    		.split("\n")[0]
	    		.trim();

	var lot_url = elem[i].href;

	var lotname = elem[i].querySelector('[class*="card-header"]').innerText.trim();

       links.push({
	       url: lot_url,
	       lot_num: lotnum,
	       auction_date: auctionDate,
	       name: lotname
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
                this.waitForSelector('[class="tab-content"]', afterWait);
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

        lot["name"] = lotData.name;
        lot["manufacturer"] = lotData.name;
        lot["model"] = lotData.name;
        lot["auction_date"] = lotData.auction_date;
        lot["lot_num"] = lotData.lot_num;

        var details = {};
        var elem = document.querySelectorAll('table[class="table m-0 p-0"] tr');
        for (var indx = 0; indx < elem.length; indx++) {
            var header = elem[indx].querySelectorAll("td")[0].innerText.trim();
            var value = elem[indx].querySelectorAll("td")[1].innerText.trim();
            details[header] = value;
        }

        if (details["REG"]) {
            lot["registration"] = details["REG"];
        }

        if (details["Mileage"]) {
            lot["mileage"] = details["Mileage"];
        }

        if (details["Colour"]) {
            lot["colour"] = details["Colour"];
        }

        if (details["Body type"]) {
            lot["type"] = details["Body type"];
        }

        if (details["Fuel"]) {
            lot["fuel"] = details["Fuel"];
        }

        if (details["Transmission"]) {
            lot["gearbox"] = details["Transmission"];
        }

        if (details["MOT"]) {
            lot["mot"] = details["MOT"];
        }

        if (details["Service"]) {
            lot["service_history"] = details["Service"];
        }

        lot["description"] = escapeHTML(
            document.querySelector('[class="tab-content"]').innerHTML
        );

        lot["images"] = [].slice
            .call(document.querySelectorAll('img[src*="imgix.net"]'))
            .map(function(img) {
                return img.src;
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
            "google",
            "amazonaws",
            "spincar",
            "FMSearchGet",
            "swipetospin",
            "cloudflare",
            "user"
        ];

        skip.forEach(function(needle) {
            if (requestData.url.indexOf(needle) > 0) {
                request.abort();
            }
        });
    });
}
