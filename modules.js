
const modules = {
  set: data => {
    if (!Object.keys(modules.get).length)
      modules.get = data
  	return true
  },
  get: {}
}

module.exports = modules
