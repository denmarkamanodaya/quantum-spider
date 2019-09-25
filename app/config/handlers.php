<?php
$container = $app->getContainer();


/**
 * 404 - Route not found
 *
 * This is the default 404 handler
 */
$container['notFoundHandler'] = function ($container) {
    return function ($request, $response) use ($container) {
        /*
        * Error :(
        */
        return $response->withStatus(404)
            ->write(
                json_encode(
                    array(
                        "status"  => "ERROR",
                        "message" => "The resource you requested could not be found.",
                        "path"    => $request->getMethod()
                            . ' ' . $request->getUri()->getPath()
                    )
                )
            );
    };
};
