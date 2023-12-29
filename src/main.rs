use std::{
    env,
    ffi::OsString,
    fs,
    path::{Path, PathBuf},
};

use anyhow::Result;
use clap::{arg, Command};
use colored::*;
use dialoguer::{theme::ColorfulTheme, Confirm, Input, Select};
use regex::Regex;
fn main() -> Result<()> {
    let app = Command::new("Install template")
        .about("Install template for vue, react, angular, svelte and etc.")
        .bin_name("tt")
        .version("0.1.0")
        .arg(arg!([DIRECTORY] "DIRECTORY for install template"))
        .get_matches();
    let directory = app.get_one::<String>("DIRECTORY");
    prompts(directory)?;

    Ok(())
}

fn get_project_name(path: &str) -> String {
    match path {
        "." => env::current_dir()
            .expect("Failed to get current directory")
            .file_name()
            .expect("Failed to get current directory name")
            .to_str()
            .expect("Failed to convert current directory name to string")
            .to_owned(),
        _ => path.to_owned(),
    }
}

fn prompts(directory: Option<&String>) -> Result<()> {
    // Set project name
    let target = match directory {
        Some(dir) => dir.to_owned(),
        None => Input::<String>::with_theme(&ColorfulTheme::default())
            .with_prompt(format!("{}", "Project name:".bright_green()))
            .interact()
            .expect("Canceled"),
    };
    let target = target.trim();
    if Path::new(target).exists() && !is_empty_dir(target)? {
        // add overwrite prompt
        let prompt_message = match target {
            "." => "Current directory".to_owned(),
            _ => format!(
                "Target directory {} is not empty. Remove existing files and continue??",
                &target
            ),
        };
        let is_overwrite = Confirm::with_theme(&ColorfulTheme::default())
            .with_prompt(prompt_message)
            .interact()
            .expect("Canceled");
        match is_overwrite {
            false => panic!("{}", format_args!("{}", "Operation canceled".red())),
            true => {
                remove_all_files(target)?;
            }
        }
    };

    // validate project name
    let project_name = to_valid_package_name(&get_project_name(target));
    if !is_valid_package_name(&project_name)? {
        panic!(
            "{}",
            format_args!("Invalid project name: {}", project_name.red().bold())
        );
    }
    // Select template
    let (languages, frameworks) = (
        ["JavaScript".green(), "TypeScript".green()],
        [
            "Vue".green(),
            "Vue2".green(),
            "React".green(),
            "Angular".green(),
            "Svelte".green(),
        ],
    );
    let language_index = Select::with_theme(&ColorfulTheme::default())
        .with_prompt("Select language:")
        .default(0)
        .items(&languages)
        .interact()?;
    let framework_index = Select::with_theme(&ColorfulTheme::default())
        .with_prompt("Select framework:")
        .default(0)
        .items(&frameworks)
        .interact()?;
    let (language, framework) = (
        languages[language_index].clone(),
        frameworks[framework_index].clone(),
    );

    // If language is TypeScript, then add -ts suffix to project name.
    // For example, "template-vue-ts" instead of "template-vue"(for JavaScript)
    let template_name = match language.clear().to_string().as_str() {
        "TypeScript" => format!("template-{}-ts", framework.to_lowercase()),
        "JavaScript" => format!("template-{}", framework.to_lowercase()),
        _ => panic!("{}", "Not supported now".red()),
    };

    // Clone template
    let mut source = find_project_root().expect("Failed to find project root");
    source.push(template_name);

    // Copy template
    copy(&source, &PathBuf::from(target))?;

    // package manager
    let manager = ["npm".green(), "yarn".green(), "pnpm".green()];
    let manger_index = Select::with_theme(&ColorfulTheme::default())
        .with_prompt("Select package manager:")
        .default(0)
        .items(&manager)
        .interact()?;
    let manager = manager[manger_index].clone();

    let cd_path = match target {
        "." => String::new(),
        _ => format!("cd {}", target),
    };

    println!("\n                  {}", cd_path.green());
    println!(
        "                  {} {}",
        manager.clone().green(),
        "install".green()
    );
    println!(
        "                  {} {}",
        manager.green(),
        "run dev".green()
    );

    Ok(())
}

// check current dir is empty
fn is_empty_dir(path: impl AsRef<Path>) -> Result<bool> {
    let (entries, mut count) = (path.as_ref().read_dir()?, 0);
    for entry in entries {
        let file_name = entry?.file_name().to_string_lossy().to_lowercase();
        if file_name != ".git" {
            return Ok(false);
        }
        if count > 1 {
            return Ok(false);
        }
        count += 1;
    }
    Ok(true)
}

fn remove_all_files(path: impl AsRef<Path>) -> Result<()> {
    let entries = path.as_ref().read_dir()?;
    for entry in entries {
        let path = entry?.path();
        match path.is_dir() {
            true => fs::remove_dir_all(path)?,
            false => fs::remove_file(path)?,
        }
    }
    Ok(())
}

fn is_valid_package_name(project_name: &str) -> Result<bool> {
    let re = Regex::new(r"^(?:@[a-z\d\-*~][a-z\d\-*._~]*/)?[a-z\d\-~][a-z\d\-._~]*$")?;
    Ok(re.is_match(project_name))
}

fn to_valid_package_name(project_name: &str) -> String {
    project_name
        .trim()
        .to_lowercase()
        .replace(' ', "-")
        .trim_start_matches(|c: char| c == '.' || c == '_')
        .replace(
            |c: char| !(c.is_ascii_alphanumeric() || c == '-' || c == '~'),
            "-",
        )
}

fn find_project_root() -> Option<PathBuf> {
    let mut current_dir = env::current_exe().ok()?;

    while current_dir.pop() {
        if current_dir.join("package.json").exists() {
            return Some(current_dir);
        }
    }

    None
}

fn copy<P: AsRef<Path>>(src: P, dst: P) -> Result<()> {
    if !dst.as_ref().exists() {
        fs::create_dir(&dst)?;
    }
    let (src, dst) = (src.as_ref(), dst.as_ref());
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let file_name = match entry.file_name() {
            file_name if file_name == "_gitignore" => OsString::from(".gitignore"),
            file_name => file_name,
        };
        let (src_file, dst_file) = (src.join(entry.file_name()), dst.join(file_name));
        match entry.file_type()? {
            file_type if file_type.is_file() => {
                fs::copy(&src_file, &dst_file)?;
            }
            file_type if file_type.is_dir() => {
                fs::create_dir_all(&dst_file)?;
                copy(&src_file, &dst_file)?;
            }
            _ => {}
        }
    }

    Ok(())
}
