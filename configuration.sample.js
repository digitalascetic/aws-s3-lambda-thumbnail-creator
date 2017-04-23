exports.configuration = {

    /**
     * 
     */
    thumb150x150: {
        width: 150,
        height: 150,
        postfix: '-150x150',
        fileMatch: /^(?!tmp)/gi
    },

    default: {
        allowedFileTypes: ['png', 'jpg', 'jpeg', 'bmp', 'tiff', 'pdf', 'gif'],
        acl: 'public-read',
        quality: 90,
        interlace: 'Line'
    }

};

