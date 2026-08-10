import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const iconDir = path.join(root, "public", "icons");

const icons = [
  {
    input: "icon.svg",
    output: "icon-192.png",
    size: 192,
  },
  {
    input: "icon.svg",
    output: "icon-512.png",
    size: 512,
  },
  {
    input: "icon.svg",
    output: "apple-touch-icon.png",
    size: 180,
  },
  {
    input: "icon.svg",
    output: "favicon-32x32.png",
    size: 32,
  },
  {
    input: "icon.svg",
    output: "favicon-16x16.png",
    size: 16,
  },
  {
    input: "icon-maskable.svg",
    output: "icon-maskable-512.png",
    size: 512,
  },
];

async function generateIcon({ input, output, size }) {
  const inputPath = path.join(iconDir, input);
  const outputPath = path.join(iconDir, output);

  const svg = await fs.readFile(inputPath);

  await sharp(svg).resize(size, size).png().toFile(outputPath);

  console.log(`✓ ${output}`);
}

async function main() {
  await fs.mkdir(iconDir, { recursive: true });

  await Promise.all(icons.map(generateIcon));

  console.log("\nAll icons generated successfully.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
