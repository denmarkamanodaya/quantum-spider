<?php
/**
 * Quantum/Spiders
 *
 * Responsible for scraping vertical external sites content
 * and transmitting them back to the repository for processing.
 *
 * @copyright 2018 Quantum/Spiders
 */

namespace Spider\Transmit\Adapter;


abstract class AbstractAdapter
{
    abstract public function transmit($filename);
}
