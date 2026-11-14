# P2PDF

Photo-to-PDF converter. React + Vite, OpenCV.js, Canvas, jsPDF. No backend, everything runs on the device.

## Run
    npm install
    npm run dev        # http://localhost:5173
    npm run build      # production build in dist/

## Deploy to GitHub Pages
1. Push this project to a GitHub repository.
2. In the repository, open **Settings → Pages** and set the source to **GitHub Actions**.
3. Push to GitHub; the workflow builds the app and deploys it. The published URL appears in the workflow run or under **Settings → Pages**.

## Notes
- The camera only works on https or localhost. To test on a phone, deploy dist/ (Vercel, Netlify, Render) or use an https tunnel.
- OpenCV.js is bundled in public/opencv.js (about 10 MB), so detection works offline. If it ever fails to load, manual corners and Original mode still work.
- Live scan draws an outline around the document about 8 times a second. Captured and uploaded photos are cropped and straightened automatically in Clean document mode.
- Limit: 10 pages per PDF, shared between camera and uploads.
"# PIC2PDF"  
