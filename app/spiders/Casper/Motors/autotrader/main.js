/**
 * Full-Feed Spider 2P
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

// -----------------------------------------------------------------------------
// Casper initialization
// -----------------------------------------------------------------------------

// Initialize CasperJS
var casper = qs.getCasper();

// Initialize any spider event listeners
linkSpiderEventListeners();

// Specify headless browser rendering
casper.userAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X)");

casper
    .start("https://www.autotrader.co.uk/car-search?sort=sponsored&radius=1500&postcode=bh255sj&onesearchad=Used&onesearchad=Nearly%20New&onesearchad=New&seller-type=private")
    .then(function() 
    {
    
        qs.log("--");
        qs.log("Starting spider run...");

        // Step 1: Clear previously logged scrape data
        qs.scrapeDataLog.reset();

        // Step 2: Gather all catalogue links
        gatherAllCatalogueLinks.call(this);

        // Step 3: Loop through each catalogue links and gather all the lot links that we need to scrape
        gatherResultLinksFromCatalogues.call(this);

        // Step 4: After gather all the url from catalogue, navigate and scrape lot info
        this.then(function() 
        {
            if (scrapeData.links.length > 0) 
            {
                qs.log("Navigate lots url and scrape data.");

                spiderDetailsPage.call(this);
            }
            else
            {
                qs.log("Navigation completed. No links provided.");
            }
        });

      
        // // Step 4: finalize and send result to importer via API call
        // this.then(function() 
        // {
        //     qs.log("Spider run completed.");
        //     qs.scrapeDataLog.finalize(this);
        //     qs.scrapeDataLog.sendResults(this);
        // });
    })
    .run();

function gatherAllCatalogueLinks() 
{
    this.then(function() 
    {
        qs.log("Gather All Catalogue Links if any.");

        this.waitForSelector(
        
            'ul.search-page__results',
        
            function() 
            {
                auction_urls = this.evaluate(function() 
                {
                    var auction_urls    = [];
                    
                    // default: 100
                    for (var x = 1; x <= 1; x++) 
                    {
                        var auction_url     = "https://www.autotrader.co.uk/car-search?sort=sponsored&radius=1500&postcode=bh255sj&onesearchad=Used&onesearchad=Nearly%20New&onesearchad=New&seller-type=private&page=" + x;

                        auction_urls.push({
                            url: auction_url
                            ,auction_date: '1988-11-11',
                        });
                    }

                    return auction_urls;
                });
            }
        );
    });

    this.then(function() 
    {
        qs.log(auction_urls.length + " Total catatalogues found.");
    });
}

function gatherResultLinksFromCatalogues() 
{
    this.then(function() 
    {
        if (auctionIdx < auction_urls.length && auction_urls[auctionIdx]) 
        {
            qs.log("Navigate catalogue: " + auction_urls[auctionIdx].url);

            // Navigate catalogue url then open to load page
            this.thenOpen(auction_urls[auctionIdx].url);

            this.then(function() 
            {
                var afterWait = function() 
                {
                    addLinksToScrapeData.call(this);

                    this.then(function() 
                    {
                        // Increment the current search results page
                        auctionIdx++;
                    
                        if (scrapeData.links.length > 0) 
                        {
                            // Loop through this function until there is none left
                            this.then(gatherResultLinksFromCatalogues);
                        } 
                        else 
                        {
                            qs.log("No Results Found!");
                        }
                    });
                };

                this.then(function() 
                {
                    this.waitForSelector('ul.search-page__results', afterWait);
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
function addLinksToScrapeData() 
{
    this.then(function() 
    {
        qs.log("Scraping search results page: " + this.getCurrentUrl());

        var newLinks        = this.evaluate(getLinks, auction_urls[auctionIdx]);
        scrapeData.links    = scrapeData.links.concat(newLinks);

        qs.log("Found " + newLinks.length + " links on page. Total to scrape data: " + scrapeData.links.length);
    });
}

// Parse links from element inside the page.
function getLinks(auctionInfo) 
{   
    var links       = [];
    var element     = document.querySelectorAll('li.search-page__result');

    for (var i = 0; i < element.length; i++) 
    {
        var lotname  = element[i].querySelector('h2.listing-title').innerText.trim();
        var lot_url  = element[i].querySelector('h2.listing-title > a.listing-fpa-link').href;

        links.push({
            url:        lot_url,
            name:       lotname
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
function spiderDetailsPage() 
{
    var url, lotData;

    this.then(function() 
    {
        // if (scrapeData.links[scrapeData.currentData]) 
        // {
        //     url         = scrapeData.links[scrapeData.currentData].url;
        //     lotData     = scrapeData.links[scrapeData.currentData] || {};

        //     qs.log("DK OPEN URL & WAIT: " + url);

        //     this.thenOpen(url);

        //     this.waitForSelector('body', 

        //         function()
        //         {
        //             gatherDetails.call(this, url, lotData);
        //             scrapeData.currentData++;
        //             this.then(spiderDetailsPage);
        //         },

        //         function _onTimeout()
        //         {
        //             qs.log("No record of selector on page.", this.getCurrentUrl());
        //         }
        //     );
        // }
        // else 
        // {
        //     qs.log("Total lots found: " + scrapeData.links.length + "; Total lots scraped: " + scrapeData.currentData);
        // }

            //url = scrapeData.links[scrapeData.currentData].url;
            url = "https://www.autotrader.co.uk/classified/advert/201905017486942";

            this.thenOpen(url);
            this.wait(25000);
            this.then(function()
            {
                // var body_html;
                // this.waitForSelectorTextChange('div.app-root', function() {
                //    body_html = this.evaluate(function() {
                //        return document.body.innerHTML;
                //    });

                //    qs.log(body_html);
                // });                

                var body_html = this.evaluate(function () {
                    return document.body.innerHTML;
                });

                qs.log(body_html); 
                qs.log("DK : " + url);

                this.capture('screenshot.png');
            });
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
function gatherDetails(url, lotData) 
{
    this.then(function() 
    {
        qs.log("DK GATHER DETAILS");

        lotData         = lotData || {};

        var finalUrl    = url;
        var lotDetails  = this.evaluate(parse, lotData);	
        var lotStatus   = this.currentHTTPStatus;

        if(this.currentHTTPStatus === 404) 
        {
            qs.log(" - Lot: " + finalUrl + " - Error (HTTP 404)", "ERROR");
        }
        else if(this.currentHTTPStatus === 500) 
        {
            qs.log(" - Lot: " + finalUrl + " - Error (HTTP 505)", "ERROR");
        }
        else if(lotDetails && lotDetails._error) 
        {
            qs.log(" - Lot: " + finalUrl + " - " + JSON.stringify(lotDetails._error), "ERROR");
        }
        else
        {
            qs.log(" - Lot: " + finalUrl);
        }

        /*
            Apply some additional standard formatting to the raw lot data
         */
        lotDetails = {
            source: {
                url:    finalUrl,
                date:   new Date().toUTCString(),
                status: lotStatus
            },
            data: lotDetails
        };

        // Save the lotDetails directly to a file (rather than collect it in memory)
        qs.scrapeDataLog.saveData(lotDetails);
    });
}

function parse(lotData) 
{
    lot = {};

    try 
    {
        // Escape all HTML characters
        function escapeHTML(value) 
        {
            var map = {
                amp: "&",
                lt: "<",
                gt: ">",
                quot: '"',
                "#039": "'",
                nbsp: " "
            };

            return value.replace(/&([^;]+);/g, function(f, c) { return map[c]; });
        }

        // remove the lot url so that it will not be include in the data object
        delete lotData.url;

        var details = {};
        var elem    = document.querySelectorAll('article[class*="fpa"]');

        // for (var indx = 0; indx < elem.length; indx++) 
        // {
        //     if (elem[indx].innerText.split(":").length == 2) 
        //     {
        //         var header = elem[indx].innerText.split(":")[0].trim();
        //         var value  = elem[indx].innerText.split(":")[1].trim();
        //     }

        //     details[header] = value;
        // }

     //    lot['registration'] = '---';
     //    lot['mileage'] = '---';
     //    lot['gearbox'] = '---';
     //    lot['fuel'] = '---';
     //    lot['colour'] = '---';
     //    lot['mot'] = '---';
    	// lot['service_history'] = "---";
    	// lot['engine_size'] = '---';
    	// lot['type'] = '---';
    	// lot['additional_info'] = details['Colour'];
    	// lot["description"] = '---';

        // // Manufacturer
        // if (details["Manufacturer"]) 
        // {
        //     lot["manufacturer"] = details["Manufacturer"];
        // }

        // // Model
        // if (details["Model"]) 
        // {
        //     lot["model"] = details["Model"];
        // }

        // Mileometer
        lot["mileage"] = elem;
        

        // // Colour
        // if (details["Colour"]) 
        // {
        //     lot["colour"] = details["Colour"];
        // }

        // // MOT
        // if (details["MOT"]) 
        // {
        //     lot["mot"] = details["MOT"];
        // }

        // // Registration No
        // if (details["Registration No"]) 
        // {
        //     lot["registration"] = details["Registration No"];
        // }

        // // Estimate
        // lot["estimate"] = document.querySelector('[class="product-price-container"]').innerText.replace("Guide Price:", "").trim();

        // //description
        // var description = "";
        // // description += document.querySelector('[class="page-header-desc"]').innerHTML + "<br/><br/>";
        // // description += document.querySelector('[class="mb50"]').previousElementSibling.innerHTML;
        // lot["description"] = description;

        // // Auction Date
        // lot["auction_date"] = lotData.auction_date;

        // lot["images"] = [].slice.call(document.querySelectorAll('[class*="product-gallery"] img'))
        //     .map(function(img) 
        //     {
        //         return img.src;

        //     }).filter(function(item, pos, self) 
        //     {
        //         return self.indexOf(item) == pos;

        //     }).join(", ");


        lot["description"]  = "TEST";
        lot["manufacturer"] = "TEST";
        lot["model"]        = "TEST";
        lot["colour"]       = "TEST";
        lot["mot"]          = "TEST";
        lot["registration"] = "TEST";
        lot["estimate"]     = "TEST";
        lot["auction_date"] = "TEST";
        lot["images"]       = "TEST";

        lot = jQuery.extend({}, lot, lotData);

    } 
    catch (err) 
    {
        lot["_error"] = err.message;
    }

    return lot;
}

function linkSpiderEventListeners() 
{
    casper.on("resource.requested", function(requestData, request) 
    {
        var skip = [
            "facebook",
            "twitter",
            "cdn.syndication",
            "linkedin",
            "google-analytics",
            "youtube",
            "player-en_US",
            "addthis_widget",
            "foundation"
        ];

        skip.forEach(function(needle) 
        {
            if (requestData.url.indexOf(needle) > 0) 
            {
                request.abort();
            }
        });
    });

    casper.on("resource.requested", function(requestData, request) 
    {
        if (!(requestData.url.indexOf("autotrader") > -1)) 
        {
            request.abort();
        }
    });
}
