const pagesDir = './pages/'

const path = require('path')
const fs = require('fs-extra')
const glob = require('glob')
const pug = require('pug')
const sass = require('node-sass')
const express = require('express')

const app = express()
const expressWs = require('express-ws')(app)
app.use(express.static('public'))
app.locals.basedir = path.join(__dirname, 'templates')
app.set('view engine', 'pug')
app.set('views', 'pages')

let sockets = []; // array of Websocket instances

// Map the URL to the actual file path of the .pug template. Return null if the
// file doesn't exist.
async function getPagePath(url) {
  // Try the specific .pug file
  let result = path.join(pagesDir, url) + '.pug'
  if (await fileExists(result)) {
    return result
  }
  // Pug file doesn't exist, try index.pug under directory
  result = path.join(pagesDir, url, 'index.pug')
  if (await fileExists(result)) {
    return result
  }
  return null
}

// Return true if the file at the given path exists; false otherwise.
async function fileExists(filePath) {
  try {
    let stat = await fs.stat(filePath)
    return true
  } catch (err) {
    if (err.code === 'ENOENT') {
      return false
    } else {
      throw err
    }
  }
}

// Return true if the file should be watched for changes
function shouldWatch(filename) {
  return filename.endsWith('.scss') || filename.endsWith('.pug')
}

// Serve the home page
app.get('/', async (req, res) => {
  res.render('index.pug')
})

// Register sockets
app.ws('/reload', (ws, req) => {
  sockets.push(ws)
  ws.on('close', () => sockets = sockets.filter(socket => socket !== ws))
})

// Serve up stylesheets
app.get('/:path(*)', async (req, res, next) => {
  let path_ = path.join(pagesDir, req.params.path)

  if (path_.endsWith('.scss')) {
    sass.render({file: path_}, (err, result) => {
      if (err) {
        console.log(`Error in ${path_}:\n${err}`)
        res.send('')
      } else {
        res.type('text/css').send(result.css)
      }
    })
  } else {
    next()
  }
})

// Serve up pages
app.get('/:path(*)', async (req, res) => {
  let path_ = await getPagePath(req.params.path)

  if (path_ !== null) {
    try {
      res.render(path_.substring(6))
    } catch (err) {
      res.status(500).send(`Unexpected error: <pre>${err.message}</pre>`)
    }
  } else {
    res.status(404).send('Page not found')
  }
})

const listener = app.listen(process.env.PORT || 8000, () => {
  console.log('Your app is listening on port ' + listener.address().port)

  // Reload when sass file is changed
  fs.watch(pagesDir, {recursive: true}, (eventType, filename) => {
    if (eventType === 'change' && shouldWatch(filename)) {
      console.log(`Changed: ${filename}`)
      sockets.forEach(socket => socket.send('reload'))
    }
  })
})
