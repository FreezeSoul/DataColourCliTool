#!/usr/bin/env node

const fs = require("fs");
const fse = require("fs-extra");
const path = require("path");
const ora = require("ora");
const tar = require("tar-fs");
const chalk = require("chalk");
const express = require("express");
const copydir = require("copy-dir");
const program = require("commander");
const inquirer = require("inquirer");
const symbols = require("log-symbols");
const handlebars = require("handlebars");
const proxy = require("http-proxy-middleware");
const download = require("download-git-repo");
const child_process = require("child_process");
const ChromeLauncher = require("chrome-launcher");

const githublink = "FreezeSoul/DataColourWidgetTemplate#master";

const dcServerAddress = "http://39.101.138.43:8080";
const widgetDebugUrl = "http://127.0.0.1:8088/";

const proxyServerPort = 8080;

try {
  const packagePath = path.resolve(__dirname, "package.json");
  if (fs.existsSync(packagePath)) {
    const pjson = require(packagePath);
    const version = pjson.version;
    program.version(version, "-v, --version");
  }
} catch (error) {}

program
  .command("init <name>")
  .description("初始化Widget项目")
  .action((name) => {
    if (!fs.existsSync(name)) {
      console.log(symbols.info, chalk.white(`初始化Widget项目`));

      const spinner = ora("正在下载Widget模板...");
      spinner.start();

      download(githublink, name, { clone: false }, (err) => {
        if (err) {
          spinner.fail();
          console.log(symbols.error, chalk.red(err));
        } else {
          spinner.succeed();
          process.chdir(name);

          console.log(symbols.info, chalk.white(`开始安装依赖组件...`));
          child_process.execSync("npm install", { stdio: "inherit" });
          console.log(symbols.info, chalk.white(`完成安装依赖组件...`));

          console.log(symbols.info, chalk.white(`完成项目初始化，请创建一个Widget`));
        }
      });
    } else {
      console.log(symbols.error, chalk.red(`项目${name}已存在`));
    }
  });

program
  .command("list")
  .description("列出所有Widget")
  .action(() => {
    try {
      const widgetsPath = `src/widgets/widgets.json`;
      if (fs.existsSync(widgetsPath)) {
        const widgetsJson = fs.readFileSync(widgetsPath).toString();
        const widgets = JSON.parse(widgetsJson);

        for (let widget of widgets.widgets) {
          const widgetPath = `src/widgets/${widget.path}`;
          const widgetManifestPath = `${widgetPath}/manifest.json`;
          if (fs.existsSync(widgetManifestPath)) {
            let manifestJson = fs.readFileSync(widgetManifestPath).toString();
            const manifest = JSON.parse(manifestJson);
            console.log(symbols.info, chalk.white(`标识:${manifest.id},名称:${manifest.name},版本:${manifest.version}`));
          }
        }
      }
    } catch (error) {
      console.log(symbols.error, chalk.red(error));
    }
  });

program
  .command("create")
  .description("创建一个Widget")
  .action(() => {
    inquirer
      .prompt([
        {
          name: "id",
          message: "请输入Widget的标识，要求英文、数字、下划线",
        },
        {
          name: "name",
          message: "请输入Widget的名称，要求简短的中文名称定义",
        },
        {
          name: "description",
          message: "请输入Widget的描述，要求简短的中文描述信息",
        },
        {
          name: "tag",
          message: "请输入Widget分类标签，要求英文字母，多个逗号分割",
        },
        {
          name: "author",
          message: "请输入Widget作者名称，如：FreezeSoul<freezesoul@gmail.com>",
        },
        {
          name: "path",
          message: "请输入Widget存储路径，默认路径unofficial，建议默认",
        },
      ])
      .then((answers) => {
        try {
          const widgetId = answers.id;
          const widgetName = answers.name;
          const widgetDescription = answers.description;
          const widgetAuthor = answers.author;
          const widgetTags = answers.tag ? answers.tag : "Chart";
          const widgetPath = answers.path ? answers.path.replace(/^\/+|\/+$/g, "") : "unofficial";

          const result = createWidget(widgetId, widgetName, widgetDescription, widgetAuthor, widgetTags, widgetPath);
          if (result) {
            console.log(symbols.success, chalk.green(`Widget创建成功`));
          }
        } catch (error) {
          console.log(symbols.error, chalk.red(error));
        }
      });
  });

program
  .command("debug")
  .description("调试一个Widget")
  .action(() => {
    inquirer
      .prompt([
        {
          name: "id",
          message: "请选择要调试的Widget",
          type: "rawlist",
          choices: getWidgetsList(),
        },
        {
          name: "host",
          message: "请输入平台服务地址，默认调用公共服务",
        },
      ])
      .then((answers) => {
        try {
          const widgetId = answers.id;
          const widgetPath = getWidgetPath(widgetId);
          const serverAddress = answers.host ? answers.host : dcServerAddress;
          const widgetManifestPath = `src/widgets/${widgetPath}/manifest.json`;
          if (fs.existsSync(widgetManifestPath)) {
            const widgetsPath = `src/widgets/widgets.json`;
            let widgetsJson = fs.readFileSync(widgetsPath).toString();
            const widgets = JSON.parse(widgetsJson);
            widgets.version = getNextVersion(widgets.version);
            for (let widget of widgets.widgets) {
              widget.enable = widget.path === widgetPath;
            }
            widgetsJson = JSON.stringify(widgets, null, 2);
            fs.writeFileSync(widgetsPath, widgetsJson);

            let manifestJson = fs.readFileSync(widgetManifestPath).toString();
            const manifest = JSON.parse(manifestJson);
            manifest.version = getNextVersion(manifest.version);
            manifestJson = JSON.stringify(manifest, null, 2);
            fs.writeFileSync(widgetManifestPath, manifestJson);
            console.log(symbols.info, chalk.white(`当前Widget版本号：${manifest.version}`));

            startProxyServer(serverAddress, function () {
              const childprocess = child_process.spawn(`npm`, [`run`, `start-widget`, `-- --path=${widgetPath}`], { shell: true });
              childprocess.stdout.on("data", function (data) {
                console.log(data.toString());
              });
              childprocess.stderr.on("data", function (data) {
                console.log(data.toString());
              });
            });
          } else {
            console.log(symbols.error, chalk.red(`Widget:${widgetId}不存在`));
          }
        } catch (error) {
          console.log(symbols.error, chalk.red(error));
        }
      });
  });

program
  .command("build")
  .description("构建一个Widget")
  .action(() => {
    inquirer
      .prompt([
        {
          name: "id",
          message: "请选择要构建的Widget",
          type: "rawlist",
          choices: getWidgetsList(),
        },
      ])
      .then((answers) => {
        try {
          const widgetId = answers.id;
          const widgetPath = getWidgetPath(widgetId);
          const widgetManifestPath = `src/widgets/${widgetPath}/manifest.json`;
          if (fs.existsSync(widgetManifestPath)) {
            let manifestJson = fs.readFileSync(widgetManifestPath).toString();
            const manifest = JSON.parse(manifestJson);
            manifest.version = getNextVersion(manifest.version);
            manifestJson = JSON.stringify(manifest, null, 2);
            fs.writeFileSync(widgetManifestPath, manifestJson);
            console.log(symbols.info, chalk.white(`当前Widget版本号：${manifest.version}`));

            child_process.execSync(`npm run build-widget:pro -- --path=${widgetPath}`, {
              stdio: "inherit",
            });
          } else {
            console.log(symbols.error, chalk.red(`Widget:${widgetId}不存在`));
          }
        } catch (error) {
          console.log(symbols.error, chalk.red(error));
        }
      });
  });

program
  .command("buildAll")
  .description("构建所有Widgets")
  .action(() => {
    try {
      const widgetObjs = getWidgetsList();
      for (let widgetObj of widgetObjs) {
        const widgetId = widgetObj.value;
        const widgetPath = getWidgetPath(widgetId);
        const widgetManifestPath = `src/widgets/${widgetPath}/manifest.json`;
        if (fs.existsSync(widgetManifestPath)) {
          let manifestJson = fs.readFileSync(widgetManifestPath).toString();
          const manifest = JSON.parse(manifestJson);
          manifest.version = getNextVersion(manifest.version);
          manifestJson = JSON.stringify(manifest, null, 2);
          fs.writeFileSync(widgetManifestPath, manifestJson);

          console.log(symbols.info, chalk.white(`当前Widget标识：${widgetId}`));
          console.log(symbols.info, chalk.white(`当前Widget版本号：${manifest.version}`));

          child_process.execSync(`npm run build-widget:pro -- --path=${widgetPath}`, {
            stdio: "inherit",
          });

          console.log(symbols.success, chalk.green(`完成构建Widget：${manifest.version}`));
          const widgetDistPath = `dist/widgets/${widgetPath}`;
          const widgetTargetPath = `build/${widgetPath}`;

          if (!fs.existsSync("build")) {
            fs.mkdirSync("build");
          }

          if (fs.existsSync(widgetDistPath)) {
            fse.moveSync(widgetDistPath, widgetTargetPath);
          }
        } else {
          console.log(symbols.error, chalk.red(`Widget:${widgetId}不存在`));
        }
      }
    } catch (error) {
      console.log(symbols.error, chalk.red(error));
    }
  });

program
  .command("publish")
  .description("发布一个Widget")
  .action(() => {
    inquirer
      .prompt([
        {
          name: "id",
          message: "请选择要发布的Widget",
          type: "rawlist",
          choices: getWidgetsList(),
        },
      ])
      .then((answers) => {
        try {
          const widgetId = answers.id;
          const widgetPath = getWidgetPath(widgetId);
          const widgetSrcPath = `src/widgets/${widgetPath}`;
          const widgetDistPath = `dist/widgets/${widgetPath}`;
          const widgetManifestPath = `${widgetSrcPath}/manifest.json`;
          const timeId = new Date().toISOString().replace(/T/, "").replace(/\..+/, "").replace(/-/g, "").replace(/:/g, "");
          const widgetTicket = `${widgetId}.${timeId}`;
          const widgetSrcTarName = `${widgetTicket}.src.tar`;
          const widgetDistTarName = `${widgetTicket}.dist.tar`;
          const widgetSrcTarPath = `publish/${widgetSrcTarName}`;
          const widgetDistTarPath = `publish/${widgetDistTarName}`;

          if (!fs.existsSync("publish")) {
            fs.mkdirSync("publish");
          }

          if (fs.existsSync(widgetManifestPath)) {
            let manifestJson = fs.readFileSync(widgetManifestPath).toString();
            const manifest = JSON.parse(manifestJson);
            manifest.version = getNextVersion(manifest.version);
            manifestJson = JSON.stringify(manifest, null, 2);
            fs.writeFileSync(widgetManifestPath, manifestJson);
            console.log(symbols.info, chalk.white(`当前Widget版本号：${manifest.version}`));

            child_process.execSync(`npm run build-widget:pro -- --path=${widgetPath}`, {
              stdio: "inherit",
            });

            fs.writeFileSync(`${widgetSrcPath}/__path__.txt`, widgetPath);
            fs.writeFileSync(`${widgetDistPath}/__path__.txt`, widgetPath);

            tar.pack(widgetSrcPath).pipe(fs.createWriteStream(widgetSrcTarPath));
            tar.pack(widgetDistPath).pipe(fs.createWriteStream(widgetDistTarPath));
          } else {
            console.log(symbols.error, chalk.red(`Widget:${widgetId}不存在`));
          }
        } catch (error) {
          console.log(symbols.error, chalk.red(error));
        }
      });
  });

program
  .command("publishAll")
  .description("发布所有Widgets")
  .action(() => {
    try {
      const widgetObjs = getWidgetsList();

      const publishOne = function () {
        const widgetObj = widgetObjs.shift();
        if (!widgetObj) return;
        const widgetId = widgetObj.value;
        const widgetPath = getWidgetPath(widgetId);
        const widgetSrcPath = `src/widgets/${widgetPath}`;
        const widgetDistPath = `dist/widgets/${widgetPath}`;
        const widgetManifestPath = `${widgetSrcPath}/manifest.json`;
        const timeId = new Date().toISOString().replace(/T/, "").replace(/\..+/, "").replace(/-/g, "").replace(/:/g, "");
        const widgetTicket = `${widgetId}.${timeId}`;
        const widgetSrcTarName = `${widgetTicket}.src.tar`;
        const widgetDistTarName = `${widgetTicket}.dist.tar`;
        const widgetSrcTarPath = `publish/${widgetSrcTarName}`;
        const widgetDistTarPath = `publish/${widgetDistTarName}`;

        if (!fs.existsSync("publish")) {
          fs.mkdirSync("publish");
        }

        if (fs.existsSync(widgetManifestPath)) {
          let manifestJson = fs.readFileSync(widgetManifestPath).toString();
          const manifest = JSON.parse(manifestJson);
          manifest.version = getNextVersion(manifest.version);
          manifestJson = JSON.stringify(manifest, null, 2);
          fs.writeFileSync(widgetManifestPath, manifestJson);
          console.log(symbols.info, chalk.white(`当前Widget版本号：${manifest.version}`));

          child_process.execSync(`npm run build-widget:pro -- --path=${widgetPath}`, {
            stdio: "inherit",
          });

          fs.writeFileSync(`${widgetSrcPath}/__path__.txt`, widgetPath);
          fs.writeFileSync(`${widgetDistPath}/__path__.txt`, widgetPath);
          var srcPromise = new Promise((resolve, reject) => {
            tar
              .pack(widgetSrcPath)
              .pipe(fs.createWriteStream(widgetSrcTarPath))
              .on("finish", () => {
                resolve(true);
              })
              .on("error", (err) => {
                reject(err);
              });
          });

          var distPromise = new Promise((resolve, reject) => {
            tar
              .pack(widgetDistPath)
              .pipe(fs.createWriteStream(widgetDistTarPath))
              .on("finish", () => {
                resolve(true);
              })
              .on("error", (err) => {
                reject(err);
              });
          });
          Promise.all([srcPromise, distPromise]).then(() => {
            console.log(symbols.info, chalk.white(`Widget已发布：${widgetId}`));
            publishOne();
          });
        } else {
          console.log(symbols.error, chalk.red(`Widget:${widgetId}不存在`));
        }
      };

      publishOne();
    } catch (error) {
      console.log(symbols.error, chalk.red(error));
    }
  });

program.parse(process.argv);

/**
 * 创建widget
 * @param {*} id
 * @param {*} name
 * @param {*} description
 * @param {*} author
 * @param {*} tag
 * @param {*} path
 */
function createWidget(id, name, description, author, tag, path) {
  if (!id || !name || !description || !tag || !path) {
    console.log(symbols.error, chalk.red(`请提供完整的Widget信息`));
    return false;
  }

  console.log(symbols.info, chalk.white(`正在创建Widget:${id}...`));

  try {
    const parentPath = `${path}/${id}`;
    const rootPath = `src/widgets/${path}`;
    const widgetPath = `src/widgets/${parentPath}`;
    const widgetTemplate = `src/widgets/template/widget`;

    if (!fs.existsSync(rootPath)) {
      fs.mkdirSync(rootPath);
    }
    if (!fs.existsSync(widgetTemplate)) {
      console.log(symbols.error, chalk.red(`Widget模板文件夹不存在`));
      return false;
    }
    if (fs.existsSync(widgetPath)) {
      console.log(symbols.error, chalk.red(`Widget:${id}已存在对应目录`));
      return false;
    }

    copydir.sync(widgetTemplate, widgetPath);

    const widgetManifestPath = `${widgetPath}/manifest.json`;

    let manifestJson = fs.readFileSync(widgetManifestPath).toString();
    const manifest = JSON.parse(manifestJson);

    manifest.id = id;
    manifest.tag = tag;
    manifest.name = name;
    manifest.description = description;
    manifest.author = author;

    manifestJson = JSON.stringify(manifest, null, 2);
    fs.writeFileSync(widgetManifestPath, manifestJson);
    //const result = handlebars.compile(content)(meta);

    const widgetsPath = `src/widgets/widgets.json`;
    let widgetsJson = fs.readFileSync(widgetsPath).toString();
    const widgets = JSON.parse(widgetsJson);
    widgets.version = getNextVersion(widgets.version);
    for (let widget of widgets.widgets) {
      widget.enable = false;
    }
    widgets.widgets.push({ group: "测试", path: parentPath, enable: true });
    widgetsJson = JSON.stringify(widgets, null, 2);
    fs.writeFileSync(widgetsPath, widgetsJson);

    console.log(symbols.info, chalk.white(`完成创建Widget:${id}...`));
  } catch (error) {
    console.log(symbols.error, chalk.red(error));
    return false;
  }

  return true;
}

/**
 * @description 获取下个版本号
 * @param {*} version
 * @returns
 */
function getNextVersion(version) {
  if (version) {
    const versionMatch = version.match(/(.*\.)(\d+)$/);
    if (versionMatch && versionMatch[1] && versionMatch[2]) {
      return `${versionMatch[1]}${parseInt(versionMatch[2]) + 1}`;
    }
  }
  return version;
}

/**
 * @description 获取所有部件ID
 * @returns
 */
function getWidgetsList() {
  const widgetIds = [];
  try {
    const widgetsPath = `src/widgets/widgets.json`;
    if (fs.existsSync(widgetsPath)) {
      const widgetsJson = fs.readFileSync(widgetsPath).toString();
      const widgets = JSON.parse(widgetsJson);

      for (let widget of widgets.widgets) {
        try {
          const widgetPath = `src/widgets/${widget.path}`;
          const widgetManifestPath = `${widgetPath}/manifest.json`;
          if (fs.existsSync(widgetManifestPath)) {
            let manifestJson = fs.readFileSync(widgetManifestPath).toString();
            const manifest = JSON.parse(manifestJson);
            widgetIds.push({
              value: manifest.id,
              name: `标识:${manifest.id},名称:${manifest.name},版本:${manifest.version}`,
            });
          }
        } catch (error) {
          console.log(symbols.error, chalk.red(`${widget.path}读取失败`));
          console.log(symbols.error, chalk.red(error));
        }
      }
    }
  } catch (error) {
    console.log(symbols.error, chalk.red(`widgets.json读取失败`));
    console.log(symbols.error, chalk.red(error));
  }

  return widgetIds;
}

/**
 * @description 获取Widget清单数据
 * @returns
 */
function getWidgetPath(id) {
  const widgetsPath = `src/widgets/widgets.json`;
  let widgetsJson = fs.readFileSync(widgetsPath).toString();
  const widgets = JSON.parse(widgetsJson);
  for (let widget of widgets.widgets) {
    const widgetManifestPath = `src/widgets/${widget.path}/manifest.json`;
    let manifestJson = fs.readFileSync(widgetManifestPath).toString();
    const manifest = JSON.parse(manifestJson);
    if (manifest.id === id) {
      return widget.path;
    }
  }
  console.log(symbols.error, chalk.red(`未找到匹配的widget：${id}`));
}

/**
 * 启动代理服务
 * @param {*} url
 * @param {*} widgetPath
 * @param {*} callback
 */
function startProxyServer(url, callback) {
  console.log(symbols.info, chalk.blue(`正在启动代理服务...`));
  var app = express();
  var rewriteObj = {
    "/core/widgets": "/widgets",
  };
  var routerObj = {};
  routerObj["/core/widgets/"] = widgetDebugUrl;
  app.use(
    "/",
    proxy({
      target: url,
      changeOrigin: true,
      pathRewrite: rewriteObj,
      router: routerObj,
    })
  );
  app.listen(proxyServerPort, function () {
    console.log(symbols.info, chalk.blue(`代理服务器已启动...`));
    console.log(symbols.info, chalk.blue(`启动谷歌浏览器调试...`));
    console.log(symbols.info, chalk.green(`如浏览器启动失败，请通过如下命令行手工启动：`));
    console.log(symbols.info, chalk.green(`Window: "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --disable-web-security --user-data-dir=~/chrome_tmp`));
    console.log(symbols.info, chalk.green(`Linux: /opt/google/chrome/chrome --disable-web-security --user-data-dir=/tmp/chrome_tmp`));
    console.log(symbols.info, chalk.green(`OSX: open -n -a /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --args --disable-web-security --user-data-dir="/tmp/chrome_tmp"`));

    ChromeLauncher.launch({
      startingUrl: `http://127.0.0.1:${proxyServerPort}`,
      chromeFlags: ["--disable-web-security", "--user-data-dir=./chrome_tmp", "--media-cache-size=1", "--disk-cache-size=1"],
    }).then((chrome) => {
      console.log(symbols.info, chalk.blue(`谷歌浏览器启动成功...`));
    });
    if (callback) {
      callback();
    }
  });
}
