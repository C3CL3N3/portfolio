# Watch Together

A private watch room for playing local videos together. Each viewer chooses their own copy; videos and subtitles stay on their device.

Create a room, share the invitation, and choose matching video files. Either viewer can play, pause, and seek. Subtitles can be selected from supported embedded tracks or added from a local `.vtt` or `.srt` file.

## Local development

Requires Node.js 22 or newer.

```sh
cd backend
npm ci
npm test
npm start
```

Open `http://localhost:3000/watch/` in two browser sessions. Browser support for embedded subtitles and video codecs varies. Matching durations do not guarantee matching content.
