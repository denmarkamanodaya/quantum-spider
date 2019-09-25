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
    .start("http://www.radcliffecarauctions.co.uk/stock-list.aspx")
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
        this.waitForSelector(
            ".paging",
            function() {
                var currentURL = this.getCurrentUrl();
                search.pages = this.evaluate(function(currentURL) {
                    var pages = [];
                    var pageCnt = document.querySelectorAll(".paging a");

                    for (var i = 1; i <= pageCnt.length; i++) {
                        pages.push(currentURL + "?page=" + i);
                    }

                    return pages;
                }, currentURL);
                this.then(function() {
                    qs.log(
                        search.pages.length + " Total number of pages found"
                    );
                });
            },
            function _onTimeout() {
                qs.log("No record on the page " + this.getCurrentUrl());
            }
        );
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
                    this.waitForSelector(".listing", afterWait);
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
        'div.info a[href*="stock-detail.aspx?rnum="]'
    );

    var date = __utils__
        .getElementByXPath('//div[contains(text(),"Auctions:")]')
        .innerText.trim();

    date = date.split("Auctions:")[1].trim();

    for (var i = 0; i < elem.length; i++) {
        var lotlink = elem[i].href;

        links.push({
            url: lotlink,
            sale_date: date
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
                this.waitForSelector(".listinglong", afterWait);
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

        function getNextAuctionDate(date, days, dayNum) {
            var f, newDate;

            f = [];
            if (days > 0) {
                if (date.getDay() === dayNum) {
                    f.push(new Date(date));
                }
                newDate = new Date(date);
                newDate.setDate(newDate.getDate() + 1);
                return f.concat(getNextAuctionDate(newDate, days - 1, dayNum));
            }
            return f;
        }

        // remove the lot url so that it will not be include in the data object
        delete lotData.url;

        //name
        var name = document.querySelector(".main h3").innerText.trim();

        lot["name"] = name;
        lot["manufacturer"] = name;
        lot["model"] = name;

        var dateSale = lotData.sale_date;
        var nextAuctionDate = "";
        if (dateSale.toLowerCase().indexOf("monday") !== -1) {
            nextAuctionDate = getNextAuctionDate(new Date(), 30, 1)[0];
        } else if (dateSale.toLowerCase().indexOf("tuesday") !== -1) {
            nextAuctionDate = getNextAuctionDate(new Date(), 30, 2)[0];
        } else if (dateSale.toLowerCase().indexOf("wednesday") !== -1) {
            nextAuctionDate = getNextAuctionDate(new Date(), 30, 3)[0];
        } else if (dateSale.toLowerCase().indexOf("thursday") !== -1) {
            nextAuctionDate = getNextAuctionDate(new Date(), 30, 4)[0];
        } else if (dateSale.toLowerCase().indexOf("friday") !== -1) {
            nextAuctionDate = getNextAuctionDate(new Date(), 30, 5)[0];
        } else if (dateSale.toLowerCase().indexOf("saturday") !== -1) {
            nextAuctionDate = getNextAuctionDate(new Date(), 30, 6)[0];
        } else if (dateSale.toLowerCase().indexOf("sunday") !== -1) {
            nextAuctionDate = getNextAuctionDate(new Date(), 30, 7)[0];
        } else {
            nextAuctionDate = getNextAuctionDate(new Date(), 30, 5)[0];
        }

        lot["auction_date"] = nextAuctionDate;

        var details = {};
        var elem = document.querySelectorAll(".listinglong table tr");

        for (var indx = 0; indx < elem.length; indx++) {
            var header = elem[indx].children[0].innerText
                .replace(":", "")
                .trim();
            if (elem[indx].children.length == 2) {
                var value = elem[indx].children[1].innerText.trim();
                details[header] = value;
            }
        }

        if (name) {
            var engine_size = name;
            if (engine_size.indexOf("cc") !== -1)
                lot["engine_size"] = engine_size
                    .split(" - ")[1]
                    .trim()
                    .split(" ")[0]
                    .trim();
        }

        if (details["Reg"]) {
            lot["registration"] = details["Reg"];
        }

        if (details["MOT"]) {
            lot["mot"] = details["MOT"];
        }

        if (details["Mileage"]) {
            lot["mileage"] = details["Mileage"];
        }

        if (details["Colour"]) {
            lot["colour"] = details["Colour"];
        }

        if (details["Fuel Type"]) {
            lot["fuel"] = details["Fuel Type"];
        }

        if (details["Type"]) {
            lot["type"] = details["Type"];
        }

        if (details["Lot No."]) {
            lot["lot_num"] = details["Lot No."];
        }

        if (details["Transmission"]) {
            lot["gearbox"] = details["Transmission"];
        }

        if (details["Reserve"]) {
            lot["estimate"] = details["Reserve"];
        }

        //description
        lot["description"] = document.querySelector(".listinglong").innerHTML;

        lot["images"] = [].slice
            .call(document.querySelectorAll("tr td img"))
            .map(function(img) {
                var test = img.src;
		    test = test.replace("98", "400");
		    return test.replace("70", "286");
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
