import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const OMT_VERSION = "1.0.0.16";
const OMT_ARCHIVE_URL =
  `https://github.com/openmediatransport/libomtnet/releases/download/v${OMT_VERSION}/OpenMediaTransport.Binaries.Release.v${OMT_VERSION}.zip`;
const OMT_ARCHIVE_SHA256 = "c70e67f7e2a7ed5b4c389d99af62796a8c9c7be23c8debfae3fd8020c1dc66b9";
const PLATFORM_FILES = {
  darwin: {
    directory: "MacOS",
    files: {
      "libomt.dylib": "bf8ce200fd150b6453a5bad079bd0e392f3cd6eeb0a0934cbee9d0bc0c0ae7ec",
      "libvmx.dylib": "09814f17948dec3012ace953a85df697a841c842aabbd48cc4aa4b797acfebe2",
    },
  },
  win32: {
    directory: process.arch === "arm64" ? "Winarm64" : "Winx64",
    files: process.arch === "arm64"
      ? {
          "libomt.dll": "57654ad28ea61b75fb79b9ed9913b10d0f3d130ec73102a029850f51bb544a64",
          "libvmx.dll": "ec3116dceb1a3d1479e28d942ce26f53b1fccaead77d9b52c32671280f9831bc",
        }
      : {
          "libomt.dll": "83830687a9eb79630af16f8b1cb1cd5b2f6c36423fa0bdfd40ec7f5ed90a448d",
          "libvmx.dll": "a33167041939bce24729343963ca8fca373b5878a36ea475a76c2393c48b70ce",
        },
  },
};

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const destination = resolve(projectRoot, "src-tauri", "resources", "omt");
const optional = process.argv.includes("--optional");
const force = process.argv.includes("--force");

async function main() {
  const platform = PLATFORM_FILES[process.platform];
  if (!platform) {
    const message = `No bundled OMT binary is published for ${process.platform}/${process.arch}.`;
    if (optional) {
      console.warn(`${message} Continuing without OMT.`);
      return;
    }
    throw new Error(message);
  }

  if (!force && (await preparedRuntimeIsValid(platform))) {
    console.log(`OMT ${OMT_VERSION} runtime already prepared: ${destination}`);
    return;
  }

  const workDirectory = await mkdtemp(join(tmpdir(), "talktome-omt-"));
  try {
    const archivePath = join(workDirectory, "omt.zip");
    const archiveUrl = process.env.OMT_RUNTIME_ARCHIVE_URL || OMT_ARCHIVE_URL;
    const expectedArchiveSha = (
      process.env.OMT_RUNTIME_ARCHIVE_SHA256 || OMT_ARCHIVE_SHA256
    ).trim().toLowerCase();
    const response = await fetch(archiveUrl);
    if (!response.ok) {
      throw new Error(`Failed to download OMT runtime from ${archiveUrl}: ${response.status}`);
    }
    const archive = Buffer.from(await response.arrayBuffer());
    const archiveSha = sha256(archive);
    if (archiveSha !== expectedArchiveSha) {
      throw new Error(
        `OMT archive SHA256 mismatch. Expected ${expectedArchiveSha}, got ${archiveSha}.`,
      );
    }
    await writeFile(archivePath, archive);

    const extractDirectory = join(workDirectory, "extracted");
    await mkdir(extractDirectory, { recursive: true });
    extractZip(archivePath, extractDirectory);

    for (const [fileName, expectedSha] of Object.entries(platform.files)) {
      const source = join(extractDirectory, "Libraries", platform.directory, fileName);
      await verifyFile(source, expectedSha);
    }

    await mkdir(destination, { recursive: true });
    for (const fileName of ["libomt.dylib", "libvmx.dylib", "libomt.dll", "libvmx.dll"]) {
      await rm(join(destination, fileName), { force: true });
    }
    for (const fileName of Object.keys(platform.files)) {
      const source = join(extractDirectory, "Libraries", platform.directory, fileName);
      const target = join(destination, fileName);
      await copyFile(source, target);
      if (process.platform !== "win32") {
        await chmod(target, 0o755);
      }
    }
    await copyFile(
      join(extractDirectory, "LICENSE.txt"),
      join(destination, "LICENSE-OMT.txt"),
    );
    await writeFile(
      join(destination, "runtime.json"),
      `${JSON.stringify({
        version: OMT_VERSION,
        archiveUrl,
        archiveSha256: archiveSha,
        platform: process.platform,
        architecture: process.arch,
      }, null, 2)}\n`,
    );
    console.log(`Prepared bundled OMT ${OMT_VERSION} runtime: ${destination}`);
  } catch (error) {
    if (optional) {
      console.warn(`${error instanceof Error ? error.message : String(error)} Continuing without OMT.`);
      return;
    }
    throw error;
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
}

async function preparedRuntimeIsValid(platform) {
  try {
    const manifest = JSON.parse(await readFile(join(destination, "runtime.json"), "utf8"));
    if (
      manifest.version !== OMT_VERSION
      || manifest.platform !== process.platform
      || manifest.architecture !== process.arch
    ) {
      return false;
    }
    for (const [fileName, expectedSha] of Object.entries(platform.files)) {
      await verifyFile(join(destination, fileName), expectedSha);
    }
    await stat(join(destination, "LICENSE-OMT.txt"));
    return true;
  } catch {
    return false;
  }
}

function extractZip(archivePath, extractDirectory) {
  const result = spawnSync("tar", ["-xf", archivePath, "-C", extractDirectory], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(
      `Failed to extract OMT runtime: ${(result.stderr || result.stdout || "tar failed").trim()}`,
    );
  }
}

async function verifyFile(path, expectedSha) {
  const body = await readFile(path);
  const actualSha = sha256(body);
  if (actualSha !== expectedSha) {
    throw new Error(`OMT library SHA256 mismatch for ${path}. Expected ${expectedSha}, got ${actualSha}.`);
  }
}

function sha256(body) {
  return createHash("sha256").update(body).digest("hex");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
