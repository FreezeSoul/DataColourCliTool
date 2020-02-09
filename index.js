#!/usr/bin/env node
const fs = require("fs");
const ora = require("ora");
const chalk = require("chalk");
const copydir = require("copy-dir");
const program = require("commander");
const inquirer = require("inquirer");
const symbols = require("log-symbols");
const handlebars = require("handlebars");
const download = require("download-git-repo");
const child_process = require("child_process");

const version = "1.0.0";
const githublink = "FreezeSoul/DataColourWidgetTemplate#master";

program.version(version, "-v, --version");

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
              const widgetId = answers.id;
              const widgetName = answers.name;
              const widgetDescription = answers.description;
              const widgetAuthor = answers.author;

              const result = createWidget(widgetId, widgetName, widgetDescription, widgetAuthor);

              if (result) {
                console.log(symbols.success, chalk.green(`项目初始化完成`));
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
        const widgetId = answers.id;
        const widgetManifestPath = `src/widgets/${widgetId}/manifest.json`;
        if (fs.existsSync(widgetManifestPath)) {
          try {
            const widgetsPath = `src/widgets/widgets.json`;
            let widgetsJson = fs.readFileSync(widgetsPath).toString();
            const widgets = JSON.parse(widgetsJson);
            for (let widget of widgets.widgets) {
              widget.enable = widget.path === widgetId;
            }
            widgetsJson = JSON.stringify(widgets);
            fs.writeFileSync(widgetsPath, widgetsJson);
            child_process.execSync(`nginx -s stop`);
            child_process.execSync(`nginx -p . -c nginx.conf`);
            child_process.execSync(`npm run start-widget -- --name=${widgetId}`, {
              stdio: "inherit"
            });
          } catch (error) {
            console.log(symbols.error, chalk.red(error));
          }
        } else {
          console.log(symbols.error, chalk.red(`Widget:${widgetId}不存在`));
        }
      });
  });

program
  .command("build")
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
        const widgetId = answers.id;
        const widgetManifestPath = `src/widgets/${widgetId}/manifest.json`;
        if (fs.existsSync(widgetManifestPath)) {
          try {
            child_process.execSync(`npm run build-widget:pro -- --name=${widgetId}`, {
              stdio: "inherit"
            });
          } catch (error) {
            console.log(symbols.error, chalk.red(error));
          }
        } else {
          console.log(symbols.error, chalk.red(`Widget:${widgetId}不存在`));
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

    manifestJson = JSON.stringify(manifest);
    fs.writeFileSync(widgetManifestPath, manifestJson);
    //const result = handlebars.compile(content)(meta);

    const widgetsPath = `src/widgets/widgets.json`;
    let widgetsJson = fs.readFileSync(widgetsPath).toString();
    const widgets = JSON.parse(widgetsJson);
    for (let widget of widgets.widgets) {
      widget.enable = false;
    }
    widgets.widgets.push({ group: "测试", tag: "Test", path: id, enable: true });
    widgetsJson = JSON.stringify(widgets);
    fs.writeFileSync(widgetsPath, widgetsJson);

    console.log(symbols.info, chalk.white(`完成创建Widget:${id}...`));

    console.log(symbols.info, chalk.white(`开始安装依赖组件...`));

    child_process.execSync("npm install", { stdio: "inherit" });

    console.log(symbols.info, chalk.white(`完成安装依赖组件...`));
  } catch (error) {
    console.log(symbols.error, chalk.red(error));
  }

  return true;
}
