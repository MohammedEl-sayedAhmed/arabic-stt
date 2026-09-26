# The Tafrigh video

A 40-second product video of the app, 1920 x 1080, 30 frames a second, H.264, in two versions that
differ only in the music:

- `tafrigh-tech.mp4`: a darker, electronic track in A minor, with a filtered synth sequence, digital
  bleeps and two glitch stutters (the one the main README links to);
- `tafrigh-bright.mp4`: a brighter track in C major, with a soft pad, plucks and a gentle groove.

Both tracks are original, synthesised from nothing but code (`music/tech.py` and `music/bright.py`,
numpy and soundfile only), so they are published with the project under its licence. They share the
video's cue points at 120 beats a minute: the drop on the logo at 4 s, the build from 30 s and the end
card at 36 s; the tech track also stutters at 13.5 s and 21.5 s, where the video glitches. The GIF near
the top of the main README (`docs/images/tafrigh-preview.gif`) is cut from the video.

The video is a web page. `index.html` lays out every scene with the app's own colours, fonts, radii and
shadows (see `app/static/app.css`), and one paused [GSAP](https://gsap.com) timeline in the same file
moves everything. [HyperFrames](https://github.com/heygen-com/hyperframes) (Apache-2.0) seeks that
timeline frame by frame in Chrome and encodes the frames. Every frame depends only on its time, so a
render gives the same pictures each time.

Everything shown is made up: the meeting, the names, the lines and the file.

## Files

- `index.html`: the scenes, their timing (`data-start` and `data-duration` on each scene) and the
  timeline script.
- `style.css`: the layout and the app's colour tokens, drawn at about 1.7 times the app's size.
- `assets/brands.js`: a copy of `app/static/brands.js`, the Simple Icons logos (CC0-1.0) the app shows.
  Services with no logo there get a letter tile, as in the app. `assets/icon.svg` is the app's icon.
- `fonts/`: IBM Plex Sans, IBM Plex Sans Arabic and IBM Plex Mono (the app's fonts), and Patrick Hand
  for the handwritten opening line. All are under the SIL Open Font License, in `OFL-IBM-Plex.txt` and
  `OFL-Patrick-Hand.txt`.
- `package.json`: pins HyperFrames and GSAP. `node_modules/` and `renders/` are not committed.

## Timing

The video is cut to a 120 BPM track in 4/4, so a beat is 0.5 s and a bar 2 s. Scenes change on even
seconds and smaller movements land on half seconds. Two short digital stutters (13.5 s and 21.5 s)
match glitches in the track. The video itself stays silent; the music is added to it separately.

| Starts at | Scene |
| --- | --- |
| 0 s | "Meetings don't speak one language.", then an Arabic line with English words types itself right to left |
| 4 s | The logo and the tagline (the music comes in here) |
| 6 s | Step 1, Add: planning.m4a is dropped in and transcribing starts, part 1 to 12 of 40 |
| 10 s | Step 2, Read: lines appear with Mona, Karim and Omar, each line in its own direction |
| 14 s | Step 3, Fix: a word is corrected, the change is reviewed, saved, and the history shows v0 and v1 |
| 20 s | Compare: two models side by side, the differing words marked, the better rows kept and merged |
| 26 s | Local or hosted: the services' logos settle into a grid, and the upload needs a tick |
| 30 s | Any graphics card: Intel, AMD and NVIDIA (the music builds from here) |
| 34 s | Or none at all: the processor |
| 36 s | The end card: logo, tagline, licence and the repository link (the music resolves here) |

## Preview and render

Node.js 22 or newer, FFmpeg and Google Chrome are needed. From this folder:

```sh
npm install                 # HyperFrames and GSAP, into node_modules/
npx hyperframes preview     # opens the studio in the browser, with a scrubbable timeline
npx hyperframes render --fps 30 --quality delivery --output renders/tafrigh-raw.mp4
```

The committed MP4 is that render encoded again, smaller and ready to stream from the start:

```sh
ffmpeg -i renders/tafrigh-raw.mp4 -an -c:v libx264 -preset slow -crf 20 -tune animation \
  -pix_fmt yuv420p -movflags +faststart renders/tafrigh.mp4
```

The music is made and added like this (with the project's Python, which has numpy and soundfile):

```sh
python music/tech.py renders/tech.wav        # or music/bright.py renders/bright.wav
# bring it to -14 LUFS: measure with  ffmpeg -i renders/tech.wav -af ebur128 -f null -
ffmpeg -i renders/tech.wav -af volume=<-14 minus the measured loudness>dB -c:a aac -b:a 192k music/tech.m4a
ffmpeg -i renders/tafrigh.mp4 -i music/tech.m4a -map 0:v -map 1:a -c copy -shortest -movflags +faststart tafrigh-tech.mp4
```

The GIF is 8 seconds of it (the steps, from 10 s to 18 s) at 900 pixels wide:

```sh
ffmpeg -ss 10 -t 8 -i renders/tafrigh.mp4 -vf "fps=15,scale=900:-1:flags=lanczos,palettegen=stats_mode=diff" renders/palette.png
ffmpeg -ss 10 -t 8 -i renders/tafrigh.mp4 -i renders/palette.png \
  -lavfi "fps=15,scale=900:-1:flags=lanczos[v];[v][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
  -loop 0 ../images/tafrigh-preview.gif
```

To change a scene, edit its markup and its block in the timeline script (each block is headed with
the second it starts at), then look at single frames before a full render:

```sh
npx hyperframes snapshot --at 12.5,17.5 --no-end
```
