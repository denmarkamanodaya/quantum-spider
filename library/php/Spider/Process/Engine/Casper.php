<?php
/**
 * Quantum/Spiders
 *
 * Responsible for scraping vertical external sites content
 * and transmitting them back to the repository for processing.
 *
 * @copyright 2018 Quantum/Spiders
 */

namespace Spider\Process\Engine;

use Spider\Process\Exception;

class Casper extends AbstractEngine
{
    protected function _generateSpiderExecutionInfo()
    {
        return array(
            'type'    => 'Casper',
            'pid'     => $this->_pid,
            'spider'  => $this->_name,
            'vertical' => $this->_vertical,
            'url'     => $this->_url,
            'start'   => time()
        );
    }

    /**
     * Get path config for this engine
     *
     * If no $name argument provided, default path will be returned.
     *
     * @param string $name Optional path config value to return
     *
     * @return string
     */
    protected function _getPathConfig($name = "")
    {
        if ($name) {
            return getenv($name);
        }

        return getenv('SPIDER_DATA');
    }
}
