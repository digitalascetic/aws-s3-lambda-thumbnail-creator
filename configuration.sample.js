exports.configuration = {

    /**
     * Generate a 150x150 px thumbnail
     * with a -150x150 (.jpg) postfix
     * for all files whose path starts with "public"
     */
    thumb150x150: {
        width: 150,
        height: 150,
        postfix: '-150x150',
        fileMatch: /^public/gi
    },

    /**
     * Default configuration will allow listed files types
     * create the thumbnail with "public-read" acl, a quality ok 90
     * and line interlace
     */
    default: {
        allowedFileTypes: ['png', 'jpg', 'jpeg', 'bmp', 'tiff', 'pdf', 'gif'],
        acl: 'public-read',
        quality: 90,
        interlace: 'Line'
    }

};

