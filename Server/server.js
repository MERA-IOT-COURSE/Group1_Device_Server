var log = require('../Common/logger/log')(module)
var config = require('../Common/config/config')
var app = require('./app')
var DeviceHandler = require('./device-handler')

app.set('port', config.get('port') || 3000)

var server = app.listen(app.get('port'), function () {
  log.info('Express server listening on port ' + app.get('port'))
})

var deviceHandler = new DeviceHandler()