const fs = require('fs');
const { pick, tap, thru } = require('lodash');
const path = require('path');
const { dependencies } = require('../package.json');

const OUTPUT_PATH =         path.join('out', 'dependency-licenses');
const OUTPUT_NOTICE_FILE =  path.join('out', 'NOTICE');

class TaskManager {
    constructor() {
        this.taskResults = new Map();
    }

    task(taskName) {
        const { taskResults } = this;
        return (
            taskResults.get(taskName)
            ?? tap(this[`task:${taskName}`](), (result) => { taskResults.set(taskName, result); })
        );
    }
}

class DependencyDocumenter extends TaskManager {
    constructor(dependency, packageDir, throughDeps) {
        super();
        this.name = dependency;
        this.path = packageDir;
        this.throughDeps = throughDeps;
        this.packageInfo = JSON.parse(fs.readFileSync(
            path.join(packageDir, 'package.json')
        ));
        const { version, license } = this.packageInfo;
        this.destDir = path.join(OUTPUT_PATH, `${this.name} ${version}`);
        if (license) {
            this.destDir += ` - ${license.replace(/[/\\<>:"|?*\x00-\x1f]+/g, '_').replace(/[ .]+$/, '')}`;
        }
    }

    get dependencies() {
        return this.packageInfo?.dependencies ?? {};
    }

    get dependencyNames() {
        return Object.keys(this.dependencies);
    }

    get version() {
        return this.packageInfo?.version || '';
    }

    async call() {
        const activities = [];
        const myPrototype = Object.getPrototypeOf(this);
        const instanceProps = Object.getOwnPropertyNames(Object.getPrototypeOf(this));
        for (const prop of instanceProps) {
            if (!/^package:/.test(prop)) {
                continue;
            }
            activities.push({ name: prop, resultPromise: this[prop]() });
        }
        const results = await Promise.allSettled(activities.map(a => a.resultPromise));
        activities.forEach(({ name }, i) => {
            results[i].method = name;
            results[i].packagePath = this.path;
        });
        const failures = results.filter(task => task.status !== 'fulfilled');
        if (failures.length !== 0) {
            throw new Error("Failed tasks", { cause: failures });
        }
        return results;
    }

    async "package:copyLicense"() {
        if ((await this.task('makeDestDir')) === 'exists') {
            return;
        }
        await this.task('copyLicense');
    }

    async "package:writePackageFile"() {
        if ((await this.task('makeDestDir')) === 'exists') {
            return;
        }
        await fs.promises.writeFile(
            path.join(this.destDir, 'package.json'),
            JSON.stringify(pick(this.packageInfo, [
                'author', 'authors',
                'name', 'version',
            ]), null, 2)
        );
    }

    async "package:writeDependencyChain"() {
        if (!this.throughDeps?.length) {
            return;
        }
        await this.task('makeDestDir');
        await fs.promises.appendFile(
            path.join(this.destDir, "transitivelyUsedThrough.txt"),
            this.throughDeps.join(" > ") + '\n',
            { encoding: 'utf8' }
        );
    }

    async "task:makeDestDir"() {
        const destDirStat = await fs.promises.stat(this.destDir).catch(enoentToUndefined);
        if (destDirStat) {
            return 'exists';
        }
        await fs.promises.mkdir(this.destDir, { recursive: true });
    }

    async "task:copyLicense"() {
        const srcDirContents = await fs.promises.readdir(this.path, { withFileTypes: true });
        const licenseFiles = srcDirContents.filter(
            item => item.isFile() && item.name.match(/license/i)
        ).map(
            item => path.join(this.path, item.name)
        );
        await Promise.all(licenseFiles.map(
            licenseFile => fs.promises.copyFile(
                licenseFile,
                path.join(this.destDir, path.basename(licenseFile))
            )
        ));
    }
}

class DependencyGatherer {
    constructor() {
        this.dependencies = Object.entries(dependencies).flatMap(
            ([dependency, version]) => (
                /^npm:/.exec(version)
                ? []
                : [dependency]
            )
        );
        this.noticesGathered = new Set();
    }

    async gather() {
        this.actions = [];
        await Promise.all(this.dependencies.map((dependency) => 
            this._gatherFrom(dependency)
        ));
        if (this.actions.some(a => a instanceof DependencyDocumenter)) {
            this.actions.push(async () => {
                await fs.promises.mkdir(OUTPUT_PATH, { recursive: true });
                await fs.promises.writeFile(path.join(OUTPUT_PATH, 'README'), textLines(
                    "The package containing this directory is a compiled work incorporating the",
                    "works documented as subdirectories in this tree under the respective terms of",
                    "their licenses, provided here for reference."
                ));
            });
        }
    }

    async _gatherFrom(dependency, refDirs = [], throughDeps = []) {
        const srcDir = await thru(null, async () => {
            for (const refDir of refDirs ?? []) {
                const relPath = path.join(refDir, 'node_modules', dependency);
                const relStat = await fs.promises.stat(relPath).catch(enoentToUndefined);
                if (relStat) {
                    return relPath;
                }
            }
            return path.join('node_modules', dependency);
        });

        const depInfo = new DependencyDocumenter(dependency, srcDir, throughDeps);
        this.actions.push(depInfo);
        const { license } = depInfo.packageInfo;
        const licenseHandler = this[`packageLicense:${license}`];
        if (!licenseHandler) {
            throw new Error(`Dependency "${dependency}" is provided under a(n) "${license}" license, which is not handled by the packaging code.`);
        }
        await this[`packageLicense:${license}`]?.(depInfo);
        
        await Promise.all(depInfo.dependencyNames.map(
            subDep => this._gatherFrom(subDep, [srcDir, ...refDirs], [...throughDeps, dependency])
        )).catch((err) => {
            console.error("Package refDirs: %o", refDirs);
            throw err;
        });
    }

    // Special actions based on dependency license (each license used by a
    // dependency MUST have a method):
    async "packageLicense:CC-BY-4.0"() {}
    async "packageLicense:BSD-3-Clause"() {}
    async "packageLicense:ISC"() {}
    async "packageLicense:MIT"() {}
    async "packageLicense:(MIT OR CC0-1.0)"() {}
    async "packageLicense:0BSD"() {}

    async "packageLicense:Apache-2.0"(pkgInfo) {
        const pkgVerKey = `${pkgInfo.name}\x00${pkgInfo.version}`;
        if (this.noticesGathered.has(pkgVerKey)) {
            return;
        }
        this.noticesGathered.add(pkgVerKey);

        const { path: packageDir } = pkgInfo;
        const noticeFiles = (await fs.promises.readdir(packageDir)).filter(
            entry => entry.match(/\bnotices?\b/i)
        );
        if (noticeFiles.length === 0) {
            return;
        }
        const appendNotices = async () => {
            const noticeContents = await Promise.all(noticeFiles.map(
                noticeFile => fs.promises.readFile(
                    path.join(packageDir, noticeFile),
                    { encoding: 'utf8' }
                )
            ));
            await fs.promises.appendFile(
                OUTPUT_NOTICE_FILE,
                `========== From ${pkgInfo.name} ${pkgInfo.version} ==========\n\n` +
                noticeContents.join("\n\n") +
                "\n\n",
                { encoding: 'utf8' }
            );
        };
        if (this.actions.noticeWriters) {
            this.actions.noticeWriters.push(appendNotices);
        } else {
            const noticeWriters = this.actions.noticeWriters = [appendNotices];
            const writeNoticeFile = async () => {
                for (const writeContent of noticeWriters) {
                    await writeContent();
                }
            };
            this.actions.push(writeNoticeFile);
        }
    }
}

async function main() {
    await fs.promises.rm(OUTPUT_PATH, { recursive: true, force: true });
    await fs.promises.rm(OUTPUT_NOTICE_FILE, { force: true });
    const worker = new DependencyGatherer();
    await worker.gather();
    await Promise.all(worker.actions.map(a => a.call(a)));
}

function textLines(...lines) {
    return lines.map(l => l + '\n').join('');
}

function enoentToUndefined(e) {
    if (e?.code === 'ENOENT') {
        return;
    }
    throw e;
}

if (require.main === module) {
    main().catch((err) => {
        console.error(require('util').inspect(err, { depth: 8 }));
        process.exit(1);
    });
}
