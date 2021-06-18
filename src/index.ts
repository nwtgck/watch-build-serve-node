#!/usr/bin/env node

import { spawn } from 'child_process';
import * as chokidar from 'chokidar';
import * as express from 'express';
import * as getPort from "get-port";
import * as yargs from "yargs";

type Event =  'add'|'addDir'|'change'|'unlink'|'unlinkDir';

// Define command-line parser
const parser = yargs
  .option("ignore", {
    describe: "Ignore file or directory",
    type: "array"
  })
  .alias('ignore', 'i')
  .option("public", {
    describe: "Public directory path (e.g. ./dist)",
    type: "string",
    demandOption: true,
  })
  .option("build-command", {
    describe: "Build command",
    type: "string",
    demandOption: true,
  });

// Parse command-line options
const args = parser.parse(process.argv);

const ignores: string[] = args['ignore'] as string[] || [];
const buildCommand: string = args['build-command'];
const publicDir: string = args['public'];

function runCommand(cmd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = spawn('/bin/sh', ['-c', cmd]);
    s.stdout.pipe(process.stdout);
    s.stderr.pipe(process.stderr);
    s.on('error', (err) => {
      console.error('Error: ', err);
    });
    s.on('exit', (code) => {
      resolve();
    });
  });
}

function watchAndBuild(buildCommand: string) {
  let fileUpdated: boolean = false;
  let runLock: Promise<void> = Promise.resolve();
  async function lockRunCommand(cmd: string) {
    fileUpdated = false;
    // Lock to run one build-command
    await runLock;
    // Run build-command
    runLock = runLock.then(() => runCommand(cmd));
    await runLock;
    console.log('Build finished!');
    runTime = new Date();
  }

  console.log("Watching...");
  let runTime = new Date();
  const watchListener = async (event: Event, path: string) => {
    const prevRunTime = runTime;
    fileUpdated = true;
    console.log(event, path);
    // TODO: Hard code: number
    if (new Date().getTime() - prevRunTime.getTime() < 1000) {
      setTimeout(() => {
        if (fileUpdated) {
          lockRunCommand(buildCommand);
        }
      }, 1000); // TODO: Hard code: number
      return;
    }
    lockRunCommand(buildCommand);
  };

  chokidar.watch('.', {
    ignored: ignores,
  }).on('all', watchListener);
}

// Watch file changes and build loop
watchAndBuild(buildCommand);

(async () => {
  // Get HTTP port
  const port = await getPort({port: getPort.makeRange(8080, 65535)});
  const app = express();
  app.listen(port, () => {
    console.log(`Listening on http://localhost:${port}`);
  });
  // Host built files
  app.use('/', express.static(publicDir));
})();
