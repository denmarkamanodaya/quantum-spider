<?php
/**
 * Quantum/Spiders
 *
 * Responsible for scraping vertical external sites content
 * and transmitting them back to the repository for processing.
 *
 * @copyright 2018 Quantum/Spiders
 */

namespace Spider;

use JT\Config;
use Spider\Transmit\Adapter\AbstractAdapter;
use Spider\Transmit\Adapter\Ftp;

class Transmit
{
    /**
     * @var AbstractAdapter
     */
    protected $_client;

    protected $_config;

    public function __construct($config=array())
    {
        if (!isset($config['config'])) {
            $config['config'] = array(
                'client'      => new Ftp(),
                'notifyHost'  => getenv('NOTIFY_DOWNSTREAM_HOST'),
                'notifyPath'  => getenv('NOTIFY_DOWNSTREAM_PATH')
            );
        }

        $this->_config = $config['config'];

        $this->_setTransmitClient($this->_config['client']);
    }


    protected function _setTransmitClient(AbstractAdapter $adapter)
    {
        $this->_client = $adapter;
    }

    /**
     * Transmit scrape data
     *
     * Transmits a file.  It's expected that you're trying to transmit a scrape data
     * file.  You only have to provide the base name of the file (with
     * extension) since we look in the configured scrape data directory for the file
     * by default.
     *
     * @param string $file
     * @return bool
     * @throws Transmit\Exception
     */
    public function transmitScrapeData($file)
    {
        try {
            $result = $this->_client->transmit($file);
        }
        // Just re-throw known transmit exceptions
        catch (\Spider\Transmit\Exception $e) {
            throw $e;
        }
        // Catch any other exceptions and throw as a transmit exception
        catch (\Exception $e) {
            throw new \Spider\Transmit\Exception(
                "Error transmitting file '{$file}'.",
                500,
                $e
            );
        }

        // If there was a "soft" error in transmit, throw an exception;
        if ($result === false) {
            throw new \Spider\Transmit\Exception(
                "Error transmitting file '{$file}'",
                500
            );
        }


        /*
         * Attempt to send notify the "downstream" systems.  (This tells the
         * Quantum/Input system that it should process the file now.
         */
        $this->notifyDownstream($file);

        return true;
    }


    /**
     * Notify downstream systems
     *
     * This method tells downstream systems that we have a scrape data file ready for
     * them to consume.  In every conceivable scenario, the downstream system
     * will be the Quantum/Input application.
     *
     * @param string $fileName
     * @throws Transmit\Exception
     */
    public function notifyDownstream($fileName)
    {
        try {
            // We assume all notify methods are HTTP for now
            $Client = new \Pest($this->_config['notifyHost']);

            return $Client->post(
                $this->_config['notifyPath'],
                array(
                    'file' => $fileName
                )
            );
        }
        catch (\Exception $e) {
            throw new \Spider\Transmit\Exception(
                "Error notifying downstream systems of file upload",
                500,
                $e
            );
        }
    }
}
