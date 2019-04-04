const modules = require('./modules')
const jackettApi = require('./jackett')
const helper = require('./helpers')

const streamFromMagnet = (tor, uri, type, cb) => {
	const parseTorrent = modules.get['parse-torrent']
    const toStream = (parsed) => {

        const infoHash = parsed.infoHash.toLowerCase()

        let title = tor.extraTag || parsed.name

        const subtitle = tor.seeders + ' S / ' + tor.peers + ' L'

        title += '\r\n' + subtitle

        cb({
            name: tor.from,
            type: type,
            infoHash: infoHash,
            sources: (parsed.announce || []).map(x => { return "tracker:"+x }).concat(["dht:"+infoHash]),
            title: title
        })
    }
    if (uri.startsWith("magnet:?")) {
        toStream(parseTorrent(uri))
    } else {
        parseTorrent.remote(uri, (err, parsed) => {
          if (err) {
            cb(false)
            return
          }
          toStream(parsed)
        })
    }
}

module.exports = {
	manifest: () => {
		return Promise.resolve({ 
		    "id": "org.stremio.jackett",
		    "version": "1.0.0",

		    "name": "Jackett",
		    "description": "Stremio Add-on to get torrent results from Jackett",

		    "icon": "https://static1.squarespace.com/static/55c17e7ae4b08ccd27be814e/t/599b81c32994ca8ff6c1cd37/1508813048508/Jackett-logo-2.jpg",

		    "resources": [
		        "stream"
		    ],

		    "types": ["movie", "series"],

		    "idPrefixes": [ "tt" ],

		    "catalogs": []

		})
	},
	handler: (args, local) => {
		modules.set(local.modules)
		const config = local.config
		const cinemeta = modules.get.internal.cinemeta
		const async = modules.get.async
		return new Promise((resolve, reject) => {

			if (args.resource != 'stream'){
				reject(new Error('Resource Unsupported'))
				return
			}

		    if (!args.id) {
		        reject(new Error('No ID Specified'))
		        return
		    }

		    let results = []

		    let sentResponse = false

		    const respondStreams = () => {

		        if (sentResponse) return
		        sentResponse = true

		        if (results && results.length) {

		            tempResults = results

		            // filter out torrents with less then 3 seeds

		            if (config.minimumSeeds)
		                tempResults = tempResults.filter(el => { return !!(el.seeders && el.seeders > config.minimumSeeds -1) })

		            // order by seeds desc

		            tempResults = tempResults.sort((a, b) => { return a.seeders < b.seeders ? 1 : -1 })

		            // limit to 15 results

		            if (config.maximumResults)
		                tempResults = tempResults.slice(0, config.maximumResults)

		            const streams = []

		            const q = async.queue((task, callback) => {
		                if (task && (task.magneturl || task.link)) {
		                    const url = task.magneturl || task.link
		                    // jackett links can sometimes redirect to magnet links or torrent files
		                    // we follow the redirect if needed and bring back the direct link
		                    helper.followRedirect(url, url => {
		                        // convert torrents and magnet links to stream object
		                        streamFromMagnet(task, url, args.type, stream => {
		                            if (stream)
		                                streams.push(stream)
		                            callback()
		                        })
		                    })
		                    return
		                }
		                callback()
		            }, 1)

		            q.drain = () => {
		                resolve({ streams: streams })
		            }

		            tempResults.forEach(elm => { q.push(elm) })
		        } else {
		            resolve({ streams: [] })
		        }
		    }

		    const idParts = args.id.split(':')

		    const imdb = idParts[0]

		    cinemeta.get({ type: args.type, imdb }).then(meta => {
		        if (meta) {

		            const searchQuery = {
		                name: meta.name,
		                year: meta.year,
		                type: args.type
		            }

		            if (idParts.length == 3) {
		                searchQuery.season = idParts[1]
		                searchQuery.episode = idParts[2]
		            }

		            jackettApi.search(config, searchQuery,

		                partialResponse = (tempResults) => {
		                    results = results.concat(tempResults)
		                },

		                endResponse = (tempResults) => {
		                    results = tempResults
		                    respondStreams()
		                })


		            if (config.responseTimeout)
		                setTimeout(respondStreams, config.responseTimeout)

		        } else {
		            resolve({ streams: [] })
		        }
		    })

		})
	}
}
