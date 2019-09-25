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

class Spider
{

    /**
     * @var \Spider\Process\Engine\AbstractEngine
     */
    protected $_process;

    /**
     * @var \Spider\Engine\AbstractEngine
     */
    protected $_engine;

    /**
     * @var string Spider type
     */
    protected $_spiderType;

    /**
     * @var string Spider name
     */
    protected $_spiderName;

    /**
     * @var string Spider vertical name
     */
    protected $_spiderVertical;

    /**
     * @var string Spider URL
     */
    protected $_spiderUrl;


    /**
     * Protected instance constructor
     */
    public function __construct($type, $name, $vertical, $url = "")
    {
        $this->_spiderType    = $type;
        $this->_spiderName    = $name;
        $this->_spiderVertical = $vertical;
        $this->_spiderUrl     = $url;

        //var_dump($type, $name, $vertical, $url);
        /* returns
            string(6) "Casper"
            string(13) "external-site"
            string(6) "Motors"
            string(0) ""
        */

        $this->getProcess();
        $this->getEngine();
    }

    /**
     * Get spider information
     *
     * This data is used to create instances of the Process or Engine.
     *
     * @return array
     */
    public function getSpiderInfo()
    {
        return array(
            'name'    => $this->_spiderName,
            'engine'  => $this->_spiderType,
            'vertical' => $this->_spiderVertical,
            'url'     => $this->_spiderUrl
        );
    }

    /**
     * Process factory
     * @return \Spider\Process\Engine\AbstractEngine
     *
     * @throws Exception
     */
    public function getProcess()
    {
        if ($this->_process instanceof \Spider\Process\Engine\AbstractEngine) {
            return $this->_process;
        }

        $baseClassName = '\\Spider\\Process\\Engine\\';
        $type = ucfirst(strtolower($this->_spiderType));
        $className = $baseClassName . $type;

        if (!class_exists($className)) {
            throw new Exception("Invalid process engine type: $type.");
        }

        $Process = new $className($this);

        $this->_process = $Process;

        return $this->_process;
    }

    /**
     * Get spider engine
     * @return \Spider\Engine\AbstractEngine
     *
     * @throws Exception
     */
    public function getEngine()
    {
        if ($this->_engine instanceof \Spider\Engine\AbstractEngine) {
            return $this->_engine;
        }

        switch ($this->_spiderType) {
            case "Casper":
                return new \Spider\Engine\Casper($this);
        }

        throw new Exception("Invalid spider engine: '{$this->_spiderType}'");
    }

    public function run()
    {
        return $this->getEngine()->run();
    }
}
