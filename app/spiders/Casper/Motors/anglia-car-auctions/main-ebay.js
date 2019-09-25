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

// User Agent
casper.userAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X)");

// Initialize any spider event listeners
linkSpiderEventListeners();


casper
    .start("https://www.ebay.co.uk/b/Cars-Motorcycles-Vehicles/9800/bn_1839671")
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

        // // Step 4: After gather all the url from catalogue, navigate and scrape lot info
        // this.then(function() 
        // {
        //     if (scrapeData.links.length > 0) 
        //     {
        //         qs.log("Navigate lots url and scrape data.");

        //         spiderDetailsPage.call(this);
        //     }
        //     else
        //     {
        //         qs.log("Navigation completed. No links provided.");
        //     }
        // });

      
        // Step 4: finalize and send result to importer via API call
        this.then(function() 
        {
            qs.log("Spider run completed.");
            qs.scrapeDataLog.finalize(this);
            qs.scrapeDataLog.sendResults(this);
        });
    })
    .run();

function gatherAllCatalogueLinks() 
{
    this.then(function() 
    {
        qs.log("Gather All Catalogue Links if any.");
        
        this.waitForSelector(
        
            '[id="w10"]',
        
            function() 
            {
                auction_urls = this.evaluate(function() 
                {
                    var auction_urls            = [];
                    var pagination_last_count	= 100; //temoirary

                    for (var x = 1; x <= pagination_last_count; x++) 
                    {
                        var auction_url     = "https://www.ebay.co.uk/b/Cars-Motorcycles-Vehicles/9800/bn_1839671?rt=nc&_pgn=" + x;

                        auction_urls.push({
                            url:            auction_url
                            ,auction_date: '1988-11-13',
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


                // var afterWait = function() 
                // {
                //     addLinksToScrapeData.call(this);

                //     this.then(function() 
                //     {
                //         // Increment the current search results page
                //         auctionIdx++;
                    
                //         if (scrapeData.links.length > 0) 
                //         {
                //             // Loop through this function until there is none left
                //             this.then(gatherResultLinksFromCatalogues);
                //         } 
                //         else 
                //         {
                //             qs.log("No Results Found!");
                //         }
                //     });
                // };

                // this.then(function() 
                // {
                //     this.waitUntilVisible('div[class*="search_result"]', afterWait);
                // });
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
    var element     = document.querySelectorAll('div.s-item__info');

    for (var i = 0; i < element.length; i++) 
    {
        var lotname  = element[i].querySelector('h3.s-item__title').innerText.trim();
        var lot_url  = element[i].querySelector('a.s-item__link').href;

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
        if (scrapeData.links[scrapeData.currentData]) 
        {
            url         = scrapeData.links[scrapeData.currentData].url;
            lotData     = scrapeData.links[scrapeData.currentData] || {};

            qs.log("DK OPEN URL & WAIT: " + url);

            this.thenOpen(url);

            this.waitForSelector('body', 

                function()
                {
                    gatherDetails.call(this, url, lotData);
                    scrapeData.currentData++;
                    this.then(spiderDetailsPage);
                },

                function _onTimeout()
                {
                    qs.log("No record of selector on page.", this.getCurrentUrl());
                }
            );
        }
        else 
        {
            qs.log("Total lots found: " + scrapeData.links.length + "; Total lots scraped: " + scrapeData.currentData);
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

        var vehicle_specs   = document.querySelectorAll('li.specs-list__section-item');

        for(var i=0; i<vehicle_specs.length; i++)
        {
            if(vehicle_specs[i].children[0].innerText.trim().toLowerCase() == 'exterior')
            {   
                var sub_obj = vehicle_specs[i].children[1].querySelectorAll('li.specs-list__item');

                for(var x=0; x<sub_obj.length; x++)
                {
                    // Colour
                    if(sub_obj[x].querySelector("span.specs-list__item__name").innerText.trim().toLowerCase() == 'colour')
                    {
                        lot["colour"] = sub_obj[x].querySelector("span.specs-list__item__value").innerText.trim();
                    }
                    
                    // Type
                    if(sub_obj[x].querySelector("span.specs-list__item__name").innerText.trim().toLowerCase() == 'body type')
                    {
                        lot["type"] = sub_obj[x].querySelector("span.specs-list__item__value").innerText.trim();
                    }
                }
            }
        }

        var feature_specs    = document.querySelectorAll('li.feature-specs__item');

        lot["engine_size"]  = feature_specs[0].children[0].innerText.trim();
        lot["mileage"]      = feature_specs[1].children[0].innerText.trim();
        lot["fuel"]         = feature_specs[3].children[0].innerText.trim();
        
        // Gearbox
        if( feature_specs[4].children[0].innerText.trim().toLowerCase() == 'cvt') { lot["gearbox"] = 'Auto' } else { lot["gearbox"] = feature_specs[4].children[0].innerText.trim() } ;

        lot["images"] = [].slice.call(document.querySelectorAll('[class*="theImage"]'))
            .map(function(img) 
            {
                return img.src;

            }).filter(function(item, pos, self) 
            {
                return self.indexOf(item) == pos;

            }).join(", ");


        lot["description"]  = document.querySelector('section[class="advert-description"]').innerText.trim();
        lot["manufacturer"] = "";
        lot["model"]        = "";
        lot["mot"]          = "";
        lot["registration"] = "";
        lot["estimate"]     = "";
        lot["auction_date"] = "2019-11-11";

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
        if (!(requestData.url.indexOf("ebay") > -1)) 
        {
            request.abort();
        }
    });
}
