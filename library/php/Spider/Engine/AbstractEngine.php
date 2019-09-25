<?php
/**
 * Quantum/Spiders
 *
 * Responsible for scraping vertical external sites content
 * and transmitting them back to the repository for processing.
 *
 * @copyright 2018 Quantum/Spiders
 */

namespace Spider\Engine;

abstract class AbstractEngine
{
    abstract public function run();

    abstract public function isRunning();

    abstract public function getCurrentPid();
}
