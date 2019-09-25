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

var search = {};

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
casper.options.waitTimeout = 10000;

/**
 * Initialize any spider event listeners
 */
linkSpiderEventListeners();

casper
    .start(
        "http://www.wilsonsauctions.com/upcoming-auctions?location=Newport&category=Car"
    )
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
            "#list-page",
            function() {
                auction_urls = this.evaluate(function() {
                    var auction_urls = [];
                    var element = document.querySelectorAll(
                        '[class="auction-event-summary"]'
                    );

                    for (var i = 0; i < element.length; i++) {
                        auction_urls.push({
                            url: element[i].querySelector(
                                'a[href*="/auctions/car/AuctionEvent"]'
                            ).href,
                            auction_date: element[i]
                                .querySelector('[class="time"]')
                                .innerText.trim()
                        });
                    }
                    return auction_urls;
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
                qs.log("No record on the page " + this.getCurrentUrl());
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
		this.wait(5000);
            gatherSearchPages.call(this);
        });
	/*
        this.then(function() {
            this.wait(5000);
            gatherSearchResultLinks.call(this);
        });
	*/
    }
}

function gatherSearchPages() {

	qs.log("TEST");

	var afterWait = function() {
		this.then(function() {
			qs.log("TEST2");
		});
	}

	this.then(function() {
	    this.waitForSelector('[class="react-lot-list"]', afterWait);
	});

	 /*
        this.then(function() {
            qs.log("Gather Search Pages From Every Auctions.");
            var currentURL = this.getCurrentUrl();
            search.pages = this.evaluate(function(currentURL) {
                var pages = [];
                try {
                    var pageCnt = document.querySelector('[class="total"]')
                        .innerText;

                    for (var i = 1; i <= parseInt(pageCnt); i++) {
                        pages.push(currentURL + "&lotPageNo=" + i);
                    }
                } catch (err) {}

                return pages;
            }, currentURL);
        });
	*/
	    /*
        this.then(function() {
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
	*/
    //});
	qs.log("TEST3");
}

function gatherSearchResultLinks() {
    this.then(function() {
        if (search.pages[search.currentPage + 1]) {
            qs.log(
                "There are " +
                    (search.pages.length - search.currentPage - 1) +
                    " more pages of search results to scrape."
            );

            // Navigate catalogue url
            this.thenOpen(search.pages[search.currentPage + 1]);

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
                    this.wait(2000);
                    this.waitForSelector(
                        '[class="react-lot-list"] a[href*="/lots/car?id="]',
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

        var newLinks = this.evaluate(getLinks, auction_urls[auctionIdx]);
        scrapeData.links = scrapeData.links.concat(newLinks);

        qs.log(
            "Found " +
                newLinks.length +
                " links on page. Total to scrape data: " +
                scrapeData.links.length
        );
    });
}

function getLinks(auctionInfo) {
    var links = [];
    var elem = document.querySelectorAll(
        '[class="react-lot-list"] a[href*="/lots/car?id="]'
    );
    for (var i = 0; i < elem.length; i++) {
        var lotlink = elem[i].href;

        var detailsElem = elem[
            i
        ].parentElement.parentElement.parentElement.querySelectorAll(
            "table tr"
        );

        var details = {};
        for (var indx = 0; indx < detailsElem.length; indx++) {
            var header = detailsElem[indx].children[0].innerText.trim();
            var value = detailsElem[indx].children[1].innerText.trim();

            details[header] = value;
        }

        var registration,
            mileage,
            mot,
            fuel,
            gearbox,
            estimate = "";

        if (details["Registered"]) {
            registration = details["Registered"];
        }

        if (details["Mileage"]) {
            mileage = details["Mileage"];
        }

        if (details["MOT"]) {
            mot = details["MOT"];
        }

        //fuel
        if (
            details["Details"].indexOf("petrol") > -1 ||
            details["Details"].indexOf("Petrol") > -1
        ) {
            fuel = "Petrol";
        } else if (
            details["Details"].indexOf("diesel") > -1 ||
            details["Details"].indexOf("Diesel") > -1
        ) {
            fuel = "Diesel";
        }

        //gearbox
        if (
            details["Details"].indexOf("manual") > -1 ||
            details["Details"].indexOf("Manual") > -1
        ) {
            gearbox = "Manual";
        } else if (
            details["Details"].indexOf("automatic") > -1 ||
            details["Details"].indexOf("Automatic") > -1
        ) {
            gearbox = "Automatic";
        }

        if (details["Estimate"]) estimate = details["Estimate"];

        //description
        var description = elem[
            i
        ].parentElement.parentElement.parentElement.querySelector("table")
            .innerHTML;

        var images = elem[
            i
        ].parentElement.parentElement.parentElement.parentElement.parentElement.querySelector(
            "img"
        ).src;

        var name = elem[
            i
        ].parentElement.parentElement.parentElement.parentElement.parentElement
            .querySelector('[class="title"]')
            .innerText.trim();

        if (name) {
            var engine_size = "";
            if (name.indexOf("cc") !== -1)
                engine_size = name
                    .split(" - ")[1]
                    .trim()
                    .split(" ")[0]
                    .trim();
        }

        links.push({
            url: lotlink,
            auction_date: auctionInfo.auction_date,
            registration: registration,
            mot: mot,
            mileage: mileage,
            fuel: fuel,
            gearbox: gearbox,
            estimate: estimate,
            description: description,
            images: images,
            name: name,
            model: name,
            manufacturer: name,
            engine_size: engine_size
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

            // Collect all the lot data on that page
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

        // Collect job details
        delete lotData.url;
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

    casper.on("resource.requested", function(requestData, request) {
        if (!(requestData.url.indexOf("wilsonsauctions.com") > -1)) {
            request.abort();
        }
    });
}
