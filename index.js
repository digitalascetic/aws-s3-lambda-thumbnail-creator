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
    fileType = fileType[0].substr(1);

    if (fileType === null) {
        console.error("Invalid file type found for key: " + srcKey);
        return;
    }

    for (var confKey in GLOBAL_CONFIGURATION) {

        if (confKey === 'default') {
            continue;
        }

        console.log("STANZA: " + confKey);

        var conf = {};
        Object.assign(conf, GLOBAL_CONFIGURATION.default);
        Object.assign(conf, GLOBAL_CONFIGURATION[confKey]);

        if (conf.fileMatch && !srcKey.match(conf.fileMatch)) {
            console.log("Not creating thumbnail for [" + srcKey + "]  as it dos not match [" + conf.fileMatch + "]");
            return;
        }

        var dstKey = (conf.prefix ? conf.prefix : '') + srcKey.replace(/\.\w+$/, (conf.postfix ? conf.postfix : '') + '.jpg');

        console.log('FILE TYPES', conf.allowedFileTypes);
        console.log('SRC KEY', srcKey);
        console.log('FILE TYPE', fileType);

        if (conf.allowedFileTypes.indexOf(fileType) === -1) {
            console.error("Filetype " + fileType + " not valid for thumbnail, exiting");
            return;
        }

        console.log("Creating thumbnail '" + confKey + "' from " + srcKey + " as " + dstKey);

        async.waterfall([

                function checkIsNotThumbnail(callback) {

                    console.log("Checking if the image " + bucket + ":" + srcKey + " is a thumbnail");

                    s3.headObject({
                        Bucket: bucket,
                        Key: srcKey
                    }, function (err, data) {
                        console.log("PIPPO");
                        if (err) {
                            console.error("Error retrieving object metadata: " + err);
                            return callback("Error retrieving object metadata: " + err);
                        } else {
                            if (data.Metadata && data.Metadata['thumbnail']) {
                                console.error("Will not create thumbnail of thumbnail [" + bucket + ":" + srcKey + "]");
                                return callback("Will not create thumbnail of thumbnail [" + bucket + ":" + srcKey + "]");
                            }
                            if (data.ContentType.substr(0, 5) != 'image') {
                                console.error("Will not create thumbnail as [" + bucket + ":" + srcKey + "] is not an image: [" + data.contentType + "]");
                                return callback("Will not create thumbnail as [" + bucket + ":" + srcKey + "] is not an image: [" + data.contentType + "]");
                            }
                            return callback(null);
                        }
                    });

                },

                function download(callback) {
                    //Download the image from S3
                    console.log("Downloading");

                    s3.getObject({
                        Bucket: bucket,
                        Key: srcKey
                    }, function (err, result) {
                        if (err) {
                            callback(err);
                        } else {
                            callback(null, result);
                        }
                    });
                },

                function createThumbnail(response, callback) {

                    var temp_file, image;
                    console.log("Creating thumbnail");

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
                                    callback(err);
                                } else {
                                    callback(null, response.contentType, buffer);
                                }
                            });

                    });
                },

                function uploadThumbnail(contentType, data, callback) {
                    console.log("Uploading thumbnail");

                    s3.putObject({
                        Bucket: bucket,
                        Key: dstKey,
                        Body: data,
                        ContentType: "image/jpeg",
                        ACL: conf.acl,
                        Metadata: {
                            thumbnail: 'TRUE'
                        }
                    }, function (err, data) {
                        if (err) {
                            callback(err);
                        } else {
                            callback(null);
                        }
                    });
                }

            ],
            function (err, result) {
                if (err) {
                    console.error(
                        "Unable to generate thumbnail for '" + bucket + "/" + srcKey + "'" +
                        " due to error: " + err
                    );
                } else {
                    console.log("Created thumbnail " + confKey + " at " + dstKey + " for '" + bucket + "/" + srcKey + "'");
                }
            });

    }

    console.log("Exiting thumbnail generator.");

    context.done();

};