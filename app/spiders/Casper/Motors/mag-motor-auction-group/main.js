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

//casper.userAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X)");
casper.userAgent("Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2062.120 Safari/537.36");

casper
    .start("http://www.mag.co.uk/vehicle#rows=10")
    .then(function() {
        qs.log("--");
        qs.log("Starting spider run...");

        // Clear previously logged scrape data
        qs.scrapeDataLog.reset();

        /*
            Step 1: Loop through each catalogue links and gather all the search results links that we need to scrape
        */
        gatherSearchResultLinksFromCatalogues.call(this);

        /*
            Step 2: After gather all the url from catalogue, navigate and scrape lot info
        */
        this.then(function() {
            qs.log("Navigate lots url and scrape data.");
            if (scrapeData.links.length > 0) {
                spiderDetailsPage.call(this);
            }
        });

        /*
            Step 3: finalize and send result to importer via API call
        */
        this.then(function() {
            qs.log("Spider run completed.");
            qs.scrapeDataLog.finalize(this);
            qs.scrapeDataLog.sendResults(this);
        });
    })
    .run();

function gatherSearchResultLinksFromCatalogues() {
    this.then(function() {
        this.waitForSelector('[class*="showall"]', function() {
            this.then(function() {
                this.click('[class*="showall"]');
                this.wait(5000);
            });

            this.then(addLinksToScrapeData);
        });
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

    var elem = document.querySelectorAll('a[onclick*="/Vehicle/Details/"]');
    for (var i = 0; i < elem.length; i++) {
        var lotlink = elem[i].href;
        if (elem[i].innerText.trim() === "View Details") {
            links.push({
                url: lotlink,
                registration: __utils__
                    .getElementByXPath('//div[contains(text(),"Registered")]')
                    .innerText.split("Registered")[1]
                    .trim()
            });
        }
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
                this.waitForSelector(".detailstable", afterWait);
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
        var elem = document.querySelectorAll("div.detailstable > table tr");
        for (var indx = 0; indx < elem.length; indx++) {
            var header = elem[indx].children[0].innerText.trim();
            var value = "";
            if (elem[indx].children[1]) {
                value = elem[indx].children[1].innerText.trim();
            }
            details[header] = value;
        }

        //name
        lot["name"] = document.querySelector("h1").innerText.trim();

        var reg = document.querySelectorAll("div.numberplate img");
        var regText = "";
        for (var i = 0; i < reg.length; i++) {
            regText += reg[i].alt.toUpperCase();
        }

        //registration
        lot["registration"] = regText.trim();

        //mileage
        if (details["Mileage"]) lot["mileage"] = details["Mileage"];

        //mot
        if (details["MOT To"]) lot["mot"] = details["MOT To"];

        //colour
        if (details["Colour"]) lot["colour"] = details["Colour"];

        //model
        if (details["Model"]) lot["model"] = details["Model"];

        //manufacturer
        if (details["Make"]) lot["manufacturer"] = details["Make"];

        //fuel
        if (details["Fuel Type"]) lot["fuel"] = details["Fuel Type"];

        //gearbox
        if (details["Transmission"]) lot["gearbox"] = details["Transmission"];

        //service_history
        if (details["Service History"])
            lot["service_history"] = details["Service History"];

        //lot_num
        if (details["Lot Number"]) lot["lot_num"] = details["Lot Number"];

        //description
        lot["description"] = document.querySelector(
            '[class="detailstable"]'
        ).innerText;

        lot["type"] = details["Description"];

        //auction_date
        if (details["Sale"]) lot["auction_date"] = details["Sale"];

        lot["images"] = [].slice
            .call(document.querySelectorAll("#g_thumbs img"))
            .map(function(img) {
                var img_src = img.src;
		    img_src = img_src.replace("width=100", "width=421");
		    img_src = img_src.replace("height=75", "height=315");

		return img_src;
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
