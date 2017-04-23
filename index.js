var async = require("async");
var AWS = require("aws-sdk");
var gm = require("gm").subClass({imageMagick: true});
var fs = require("fs");
var mktemp = require("mktemp");


var GLOBAL_CONFIGURATION = require('./configuration').configuration;


var s3 = new AWS.S3();


exports.handler = function (event, context) {

    var bucket = event.Records[0].s3.bucket.name;
    var srcKey = decodeURIComponent(event.Records[0].s3.object.key).replace(/\+/g, ' ');
    var fileType = srcKey.match(/\.\w+$/);

    if (fileType === null) {
        console.error("Invalid file type found for key: " + srcKey);
        return;
    }

    for (var confKey in GLOBAL_CONFIGURATION) {

        if (confKey === 'default') {
            continue;
        }

        var conf = {};
        Object.assign(conf, GLOBAL_CONFIGURATION.default);
        Object.assign(conf, GLOBAL_CONFIGURATION[confKey]);

        if (conf.fileMatch && !srcKey.match(conf.fileMatch)) {
            console.log("Not creating thumbnail for [" + srcKey + "]  as it dos not match [" + conf.fileMatch + "]");
            return;
        }

        var dstKey = (conf.prefix ? conf.prefix : '') + srcKey.replace(/\.\w+$/, (conf.postfix ? conf.postfix : '') + '.jpg');

        console.log("Creating thumbnail '" + confKey + "' from " + srcKey + " as " + dstKey);

        fileType = fileType[0].substr(1);

        if (conf.allowedFileTypes.indexOf(fileType) === -1) {
            console.error("Filetype " + fileType + " not valid for thumbnail, exiting");
            return;
        }

        async.waterfall([

                function checkIsNotThumbnail(next) {
                    s3.headObject({
                        Bucket: bucket,
                        Key: srcKey
                    }, function (err, data) {
                        if (err) {
                            console.error("Error retrieving object metadata: " + err, err.stack);
                        } else {
                            if (data.Metadata && data.Metadata['thumbnail']) {
                                console.log("Will not create thumbnail of thumbnail [" + bucket + ":" + srcKey + "]");
                                return;
                            }
                            if (data.ContentType.substr(0, 5) != 'image') {
                                console.warn("Will not create thumbnail as [" + bucket + ":" + srcKey + "] is not an image: [" + data.contentType + "]");
                                return;
                            }
                            next();
                        }
                    })
                },

                function download(next) {
                    //Download the image from S3
                    s3.getObject({
                        Bucket: bucket,
                        Key: srcKey
                    }, next);
                },

                function createThumbnail(response, next) {
                    var temp_file, image;

                    if (fileType === "pdf") {
                        temp_file = mktemp.createFileSync("/tmp/" + new Date().getTime() + ".pdf");
                        fs.writeFileSync(temp_file, response.Body);
                        image = gm(temp_file + "[0]");
                    } else if (fileType === 'gif') {
                        temp_file = mktemp.createFileSync("/tmp/" + new Date().getTime() + ".gif");
                        fs.writeFileSync(temp_file, response.Body);
                        image = gm(temp_file + "[0]");
                    } else {
                        image = gm(response.Body);
                    }

                    image.size(function (err, size) {

                        var scalingFactor = Math.min(1, conf.width / size.width, conf.height / size.height);
                        var width = scalingFactor * size.width;
                        var height = scalingFactor * size.height;

                        this.resize(width, height)
                            .strip() // Removes any profiles or comments. Work with pure data
                            .interlace(confKey.interlace ? confKey.interlace : 'None') // Line interlacing creates a progressive build up
                            .quality(confKey.quality ? confKey.quality : 100)
                            .toBuffer("jpeg", function (err, buffer) {
                                if (temp_file) {
                                    fs.unlinkSync(temp_file);
                                }

                                if (err) {
                                    next(err);
                                } else {
                                    next(null, response.contentType, buffer);
                                }
                            });
                    });
                },

                function uploadThumbnail(contentType, data, next) {
                    s3.putObject({
                        Bucket: bucket,
                        Key: dstKey,
                        Body: data,
                        ContentType: "image/jpeg",
                        ACL: conf.acl,
                        Metadata: {
                            thumbnail: 'TRUE'
                        }
                    }, next);
                }

            ],
            function (err) {
                if (err) {
                    console.error(
                        "Unable to generate thumbnail for '" + bucket + "/" + srcKey + "'" +
                        " due to error: " + err
                    );
                } else {
                    console.log("Created thumbnail " + confKey + " for '" + bucket + "/" + srcKey + "'");
                }

                context.done();
            });

    }
};