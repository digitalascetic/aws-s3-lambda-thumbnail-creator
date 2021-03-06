var async = require("async");
var AWS = require("aws-sdk");
var gm = require("gm").subClass({imageMagick: true});
var fs = require("fs");
var mktemp = require("mktemp");

var GLOBAL_CONFIGURATION = require('./configuration').configuration;

var s3 = new AWS.S3({httpOptions: {timeout: 3000}});

exports.handler = function (event, context) {

    console.log("Entering thumbnail generator.")

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

        var conf = {};
        Object.assign(conf, GLOBAL_CONFIGURATION.default);
        Object.assign(conf, GLOBAL_CONFIGURATION[confKey]);

        if (conf.fileMatch && !srcKey.match(conf.fileMatch)) {
            console.log("Not creating thumbnail for [" + srcKey + "]  as it dos not match [" + conf.fileMatch + "]");
            continue;
        }

        var dstKey = (conf.prefix ? conf.prefix : '') + srcKey.replace(/\.\w+$/, (conf.postfix ? conf.postfix : '') + '.jpg');

        if (conf.allowedFileTypes.indexOf(fileType) === -1) {
            console.error("Filetype " + fileType + " not valid for thumbnail, exiting");
            continue;
        }

        console.log("Creating thumbnail '" + confKey + "' from " + srcKey + " as " + dstKey);

        createThumbnail(bucket, srcKey, dstKey, Object.assign({}, conf), confKey);

    }

};

function createThumbnail(bucket, srcKey, dstKey, conf, confKey) {

    async.waterfall([

            function checkIsNotThumbnail(callback) {

                console.log("Checking if the image " + bucket + ":" + srcKey + " is a thumbnail");

                s3.headObject({
                    Bucket: bucket,
                    Key: srcKey
                }, callback);

            },

            function download(response, callback) {
                //Download the image from S3
                console.log("Downloading " + srcKey);

                s3.getObject({
                    Bucket: bucket,
                    Key: srcKey
                }, callback);
            },

            function createThumbnail(response, callback) {

                console.log("Creating thumbnail " + confKey);

                gm(response.Body, srcKey)
                    .resize(conf.width, conf.height ? conf.height : null)
                    .strip() // Removes any profiles or comments. Work with pure data
                    .interlace(conf.interlace ? conf.interlace : 'None') // Line interlacing creates a progressive build up
                    .quality(conf.quality ? conf.quality : 100)
                    .toBuffer("jpeg", function (err, buffer) {
                        if (err) {
                            callback(err);
                        } else {
                            callback(null, response.contentType, buffer);
                        }
                    });
            },

            function uploadThumbnail(contentType, data, callback) {

                console.log("Uploading thumbnail " + dstKey);

                s3.putObject({
                    Bucket: bucket,
                    Key: dstKey,
                    Body: data,
                    ContentType: "image/jpeg",
                    ACL: conf.acl,
                    Metadata: {
                        thumbnail: 'TRUE'
                    }
                }, callback);
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
        }
    );

}