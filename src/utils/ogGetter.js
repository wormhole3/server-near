const { default: axios } = require('axios')
const { getLinkPreview, getPreviewFromContent } = require('link-preview-js')

async function getPageOg(url) {
    try {
        const str = await getLinkPreview(url, {
            imagesPropertyType: 'og',
            timeout: 1000
        })
        return str
    }catch(e) {
        return {}
    }
}

module.exports = {
    getPageOg
}