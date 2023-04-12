import miniminst from 'minimist'
import fs from 'fs'
import { blue, cyan, green, red, reset, yellow } from 'kolorist'
import prompts from 'prompts'
import path from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'

type Options = {
  name: string
  display: string
  color: (str: string | number) => string
  variants: OptionsVariants[]
}

type OptionsVariants = {
  name: string
  display: string
  color: (str: string | number) => string
}

const renameFiles: Record<string, string> = {
  _gitignore: '.gitignore',
}

const argv = miniminst(process.argv.slice(2), {
  string: ['_'],
})

const OPTIONS = getOptions()
const DEFAULT_PROJECT = 'default_project'

async function init() {
  const argTargetDir = argv._[0]?.replace(/\/+$/g, '')
  let targetDir = argTargetDir || DEFAULT_PROJECT

  const getProjectName = () => {
    return targetDir === '.' ? path.basename(path.resolve()) : targetDir
  }

  let result: prompts.Answers<
    | 'projectName'
    | 'overwrite'
    | 'packageName'
    | 'options'
    | 'variant'
    | 'pkgManger'
  >

  try {
    result = await prompts(
      [
        {
          type: argTargetDir ? null : 'text',
          name: 'projectName',
          message: reset('Project name:'),
          initial: DEFAULT_PROJECT,
          // 无任何参数
          onState: (state) => {
            targetDir =
              (state.value as string)?.trim().replace(/\/+$/g, '') ||
              DEFAULT_PROJECT
          },
        },
        {
          type: () =>
            !fs.existsSync(targetDir) || isEmpty(targetDir) ? null : 'confirm',
          name: 'overwrite',
          message: () =>
            targetDir === '.'
              ? `Current directory`
              : `Target directory ${cyan(
                  targetDir
                )} is not empty. Remove existing files and continue?`,
        },
        {
          type: (_, { overwrite }: { overwrite?: boolean }) => {
            if (overwrite === false) {
              throw new Error(`${red('❌')} Operation canceled`)
            }
            return null
          },
          message: '',
          name: 'overwriteChecker',
        },
        {
          type: () => (isValidPackageName(getProjectName()) ? null : 'text'),
          name: 'packageName',
          initial: () => toValidPackageName(getProjectName()),
          validate: (dir: string) =>
            isValidPackageName(dir) || 'Invalid package.json name',
          message: '',
        },
        {
          type: 'select',
          name: 'options',
          message: reset('Select a template:'),
          choices: Object.values(OPTIONS).map((o) => ({
            title: o.color(o.display || o.name),
            value: o,
          })),
        },
        {
          type: (options: Options) =>
            options && options.variants ? 'select' : null,
          name: 'variant',
          message: reset('Select a variant:'),
          choices: (options: Options) =>
            options.variants.map((v) => ({
              title: v.color(v.display || v.name),
              value: v.name,
            })),
        },
        {
          type: 'select',
          name: 'pkgManger',
          message: reset('Select a package manager:'),
          initial: 0,
          choices: ['npm', 'yarn', 'pnpm'].map((p) => ({
            title: p,
            value: p,
          })),
        },
      ],
      {
        onCancel: () => {
          throw new Error(`${red('❌')} Operation canceled`)
        },
      }
    )
  } catch (e: any) {
    console.error(e.message)
    process.exit(1)
  }

  const { options, packageName, variant, overwrite, pkgManger } = result

  const root = path.resolve(process.cwd(), targetDir)

  if (overwrite) {
    emptyDir(root)
  } else if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true })
  }

  let template = variant || options.name

  console.log(`\nScaffolding project in ${root}...`)

  //TODO: do custom creation

  // current dir in the cli
  const templateDir = path.resolve(
    fileURLToPath(import.meta.url),
    '../..',
    `template-${template}`
  )

  copy(templateDir, root)

  // const { default: pkg } = (await import(
  //   path.join(templateDir, 'package.json'),
  //   {
  //     assert: { type: 'json' },
  //   }
  // )) as { default: { [key: string]: any } }

  const pkg = JSON.parse(
    fs.readFileSync(path.join(templateDir, 'package.json')).toString()
  )

  pkg.name = packageName || getProjectName()

  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify(pkg, null, 2)
  )

  try {
    spawnSync(pkgManger as string, ['install'], {
      cwd: root,
      stdio: 'inherit',
    })
    spawnSync(pkgManger as string, ['run', 'dev'], {
      cwd: root,
      stdio: 'inherit',
    })
  } catch (e) {
    console.error(e)
  }
}

// search template files
function getOptions() {
  const target = path.resolve(fileURLToPath(import.meta.url), '../..')
  const COLORS = [blue, green, yellow, cyan]
  return fs
    .readdirSync(target)
    .filter((item) => item.includes('template'))
    .reduce((res, item) => {
      const group = item.split('-')
      const groupName = group[1]
      let groupLan = group[2]?.toLowerCase()
      switch (groupLan) {
        case 'js' || 'javascript':
          groupLan = 'JavaScript'
          break
        case 'ts' || 'typescript':
          groupLan = 'TypeScript'
          break
        default:
          groupLan = 'JavaScript'
      }
      const color = COLORS[Math.floor(Math.random() * COLORS.length)]
      ;(res[groupName] ??= {
        name: groupName,
        display:
          groupName.charAt(0).toUpperCase() + groupName.slice(1).toLowerCase(),
        color,
        variants: [],
      }).variants.push({
        name: groupName,
        display: groupLan,
        color,
      })
      return res
    }, {} as { [key: string]: Options })
}

function isValidPackageName(projectName: string) {
  return /^(?:@[a-z\d\-*~][a-z\d\-*._~]*\/)?[a-z\d\-~][a-z\d\-._~]*$/.test(
    projectName
  )
}

// define empty dir
function isEmpty(path: string) {
  const files = fs.readdirSync(path)
  return (
    files.length === 0 ||
    (files.length <= 2 &&
      files.every((f) => f === '.git' || f.toUpperCase() === 'LICENSE'))
  )
}

function toValidPackageName(projectName: string) {
  return projectName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^[._]/, '')
    .replace(/[^a-z\d\-~]+/g, '-')
}

// force delete dir
function emptyDir(dir: string) {
  if (!fs.existsSync(dir)) {
    return
  }
  for (const file of fs.readdirSync(dir)) {
    fs.rmSync(path.resolve(dir, file), { recursive: true, force: true })
  }
}

function copy(dir: string, dest: string) {
  const file = fs.readdirSync(dir, 'utf-8')
  file.forEach((item) => {
    const source = path.join(dir, item)
    const target = path.join(dest, renameFiles[item] ?? item)
    const state = fs.statSync(source)

    if (state.isFile() && item !== 'package.json') {
      fs.copyFileSync(source, target)
      return
    }

    if (state.isDirectory()) {
      fs.mkdirSync(target, { recursive: true })
      copy(source, target)
    }
  })
}

init().catch((e: Error) => {
  console.error(e.message)
})
