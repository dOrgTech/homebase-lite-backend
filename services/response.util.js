const catchAsync = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
        const errName = err.name
        const errMessage = err.message;

        console.error({ errName })
        if (!errMessage) errMessage = err;

    
        console.error('CaughtError:', err);
        console.error('ErrorStack:', err.stack)
        console.error('ErrorPayload:', JSON.stringify(req.body));
        console.error('ErrorParams:', req.params);
        console.error('--------------------xxxxxx--------------------');
        console.error(err.stack)

        let responseStatusCode = 500;
        if (err.statusCode) responseStatusCode = err.statusCode

        try {
            errMessage = JSON.parse(errMessage)
            errMessage = errMessage.map(ex => ex.message).join(",")
        } catch (e) { }

        return res.status(responseStatusCode).json({
            success: false,
            message: errMessage,
        });
    });
};

module.exports = {
    catchAsync
}