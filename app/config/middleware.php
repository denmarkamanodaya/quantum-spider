<?php
use Gofabian\Negotiation\NegotiationMiddleware;

$container = $app->getContainer();

$container['NegotiationMiddleware'] = function ($container) {
    return new NegotiationMiddleware([
        'accept' => ['application/json']
    ]);
};

$app->add('NegotiationMiddleware');
