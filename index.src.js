#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const ora = require("ora");
const tar = require("tar-fs");
const Client = require("ftp");
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

const githublink = "FreezeSoul/DataColourWidgetTemplate#master";

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
  .action(name => {
    //创建项目目录
    if (!fs.existsSync(name)) {
      //首次需要创建一个widget
      console.log(symbols.info, chalk.white(`初始化Widget项目`));

      const spinner = ora("正在下载Widget模板...");
      spinner.start();

      download(githublink, name, { clone: false }, err => {
        if (err) {
          spinner.fail();
          console.log(symbols.error, chalk.red(err));
        } else {
          spinner.succeed();
          process.chdir(name);

          console.log(symbols.info, chalk.white(`开始安装依赖部件...`));
          child_process.execSync("npm install", { stdio: "inherit" });
          console.log(symbols.info, chalk.white(`完成安装依赖部件...`));

          console.log(symbols.info, chalk.white(`初始化一个Widget`));
          inquirer
            .prompt([
              {
                name: "id",
                message: "请输入Widget的标识，要求英文、数字、下划线"
              },
              {
                name: "name",
                message: "请输入Widget的名称，要求简短的中文名称定义"
              },
              {
                name: "description",
                message: "请输入Widget的描述，要求简短的中文描述信息"
              },
              {
                name: "author",
                message: "请输入作者名称，如：FreezeSoul<freezesoul@gmail.com>"
              }
            ])
            .then(answers => {
              try {
                const widgetId = answers.id;
                const widgetName = answers.name;
                const widgetDescription = answers.description;
                const widgetAuthor = answers.author;

                const result = createWidget(widgetId, widgetName, widgetDescription, widgetAuthor);

                if (result) {
                  console.log(symbols.success, chalk.green(`项目初始化完成`));
                }
              } catch (error) {
                console.log(symbols.error, chalk.red(error));
              }
            });
        }
      });
    } else {
      // 错误提示项目已存在，避免覆盖原有项目
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
            console.log(
              symbols.info,
              chalk.white(`标识:${manifest.id},名称:${manifest.name},版本:${manifest.version}`)
            );
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
          message: "请输入Widget的标识，要求英文、数字、下划线"
        },
        {
          name: "name",
          message: "请输入Widget的名称，要求简短的中文名称定义"
        },
        {
          name: "description",
          message: "请输入Widget的描述，要求简短的中文描述信息"
        },
        {
          name: "author",
          message: "请输入作者名称，如：FreezeSoul<freezesoul@gmail.com>"
        }
      ])
      .then(answers => {
        try {
          const widgetId = answers.id;
          const widgetName = answers.name;
          const widgetDescription = answers.description;
          const widgetAuthor = answers.author;
          const widgetPath = `src/widgets/${widgetId}`;
          if (!fs.existsSync(widgetPath)) {
            const result = createWidget(widgetId, widgetName, widgetDescription, widgetAuthor);

            if (result) {
              console.log(symbols.success, chalk.green(`Widget创建成功`));
            }
          } else {
            console.log(symbols.error, chalk.red(`已经存在Widget:${widgetId}`));
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
          message: "请输入要调试的Widget的标识"
        }
      ])
      .then(answers => {
        try {
          const widgetId = answers.id;
          const widgetManifestPath = `src/widgets/${widgetId}/manifest.json`;
          if (fs.existsSync(widgetManifestPath)) {
            const widgetsPath = `src/widgets/widgets.json`;
            let widgetsJson = fs.readFileSync(widgetsPath).toString();
            const widgets = JSON.parse(widgetsJson);
            for (let widget of widgets.widgets) {
              widget.enable = widget.path === widgetId;
            }
            widgetsJson = JSON.stringify(widgets);
            fs.writeFileSync(widgetsPath, widgetsJson);
            const defaultUrl = "http://103.254.70.211:18080";
            startProxyServer(defaultUrl, function() {
              const childprocess = child_process.exec(
                `npm run start-widget -- --name=${widgetId}`,
                {
                  shell: true,
                  detached: true
                }
              );
              childprocess.stdout.on("data", function(data) {
                console.log(data.toString());
              });
              childprocess.stderr.on("data", function(data) {
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
          message: "请输入要构建的Widget的标识"
        }
      ])
      .then(answers => {
        try {
          const widgetId = answers.id;
          const widgetManifestPath = `src/widgets/${widgetId}/manifest.json`;
          if (fs.existsSync(widgetManifestPath)) {
            child_process.execSync(`npm run build-widget:pro -- --name=${widgetId}`, {
              stdio: "inherit"
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
  .command("publish")
  .description("发布一个Widget")
  .action(() => {
    inquirer
      .prompt([
        {
          name: "id",
          message: "请输入要发布的Widget的标识"
        }
      ])
      .then(answers => {
        try {
          const widgetId = answers.id;
          const widgetPath = `src/widgets/${widgetId}`;
          const widgetManifestPath = `${widgetPath}/manifest.json`;
          const timeId = new Date()
            .toISOString()
            .replace(/T/, "")
            .replace(/\..+/, "")
            .replace(/-/g, "")
            .replace(/:/g, "");
          const widgetTicket = `${widgetId}${timeId}`;
          const widgetTar = `${widgetTicket}.tar`;
          if (fs.existsSync(widgetManifestPath)) {
            //压缩Widget目录
            tar.pack(widgetPath).pipe(fs.createWriteStream(widgetTar));
            //连接FTP服务器
            connectFtp(function(ftp) {
              const spinner = ora("部件正在发布中...");
              spinner.start();
              const uploadfile = fs.createReadStream(widgetTar);
              const fileSize = fs.statSync(widgetTar).size;
              ftp.put(uploadfile, widgetTar, function(err) {
                if (err) {
                  spinner.fail();
                  console.log(symbols.error, chalk.red(err));
                  throw err;
                }
                ftp.end();
                spinner.succeed("部件正在发布中...");
                console.log(symbols.info, chalk.white(`部件已成功发布...`));
                console.log(symbols.info, chalk.white(`请反馈发布序号:${widgetTicket}`));
              });
              let uploadedSize = 0;
              uploadfile.on("data", function(buffer) {
                uploadedSize += buffer.length;
                spinner.text =
                  "部件正在发布中...\t" + (((uploadedSize / fileSize) * 100).toFixed(2) + "%");
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

program.parse(process.argv);

/**
 * 创建widget
 * @param {*} id
 * @param {*} name
 * @param {*} description
 * @param {*} author
 */
function createWidget(id, name, description, author) {
  if (!id || !name || !description) {
    console.log(symbols.error, chalk.red(`请提供完整的Widget信息`));
    return false;
  }

  console.log(symbols.info, chalk.white(`正在创建Widget:${id}...`));

  try {
    const widgetPath = `src/widgets/${id}`;
    const widgetTemplate = `src/widgets/widget`;

    if (!fs.existsSync(widgetTemplate)) {
      console.log(symbols.error, chalk.red(`Widget模板文件夹不存在`));
      return false;
    }
    if (fs.existsSync(widgetPath)) {
      console.log(symbols.error, chalk.red(`Widget:${id}已存在`));
      return false;
    }

    copydir.sync(widgetTemplate, widgetPath);

    const widgetManifestPath = `${widgetPath}/manifest.json`;

    let manifestJson = fs.readFileSync(widgetManifestPath).toString();
    const manifest = JSON.parse(manifestJson);

    manifest.id = id;
    manifest.name = name;
    manifest.description = description;
    manifest.author = author;

    manifestJson = JSON.stringify(manifest, null, 2);
    fs.writeFileSync(widgetManifestPath, manifestJson);
    //const result = handlebars.compile(content)(meta);

    const widgetsPath = `src/widgets/widgets.json`;
    let widgetsJson = fs.readFileSync(widgetsPath).toString();
    const widgets = JSON.parse(widgetsJson);
    for (let widget of widgets.widgets) {
      widget.enable = false;
    }
    widgets.widgets.push({ group: "测试", tag: "Test", path: id, enable: true });
    widgetsJson = JSON.stringify(widgets, null, 2);
    fs.writeFileSync(widgetsPath, widgetsJson);

    console.log(symbols.info, chalk.white(`完成创建Widget:${id}...`));
  } catch (error) {
    console.log(symbols.error, chalk.red(error));
  }

  return true;
}

/**
 * 启动代理服务
 * @param {*} url
 * @param {*} callback
 */
function startProxyServer(url, callback) {
  console.log(symbols.info, chalk.blue(`正在启动代理服务...`));
  var app = express();
  app.use(
    "/",
    proxy({
      target: url,
      changeOrigin: true,
      pathRewrite: {
        "/core/widgets": "/widgets"
      },
      router: { "/core/widgets": "http://127.0.0.1:8088/" }
    })
  );
  app.listen(9999, function() {
    console.log(symbols.info, chalk.blue(`代理服务器已启动...`));
    if (callback) {
      callback();
    }
  });
}

/**
 * 连接服务器地址
 * @param {*} callback
 */
function connectFtp(callback) {
  const ftp = new Client();
  const spinner = ora("开始建立服务器连接...");
  spinner.start();
  ftp.on("ready", function() {
    spinner.succeed();
    console.log(symbols.info, chalk.white(`服务器连接已建立...`));
    if (callback) {
      callback(ftp);
    }
  });
  ftp.on("error", function(err) {
    spinner.fail();
    console.log(symbols.error, chalk.red(err));
  });
  ftp.connect({ host: "173.242.120.250", user: "datacolour", password: "datacolour" });
}