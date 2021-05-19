using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Xml;

namespace GDeps
{
    public class SubstratePackage
    {
        private const string RemoteRootPath = @"//redmond/exchange/Build/SUBSTRATE/LATEST/target/dev";

        private string _rootPath;

        private string _projectPath;

        private string _targetRootPath;

        private bool _override = false;
        private bool _getAll = false;

        public SubstratePackage(string projectPath, bool[] args)
        {
            _projectPath = projectPath;
            _override = args[0];
            _getAll = args[1];

            var directoryInfo = new FileInfo(projectPath).Directory;

            string check1;
            string check2;
            string check3;
            do
            {
                directoryInfo = directoryInfo.Parent;
                check1 = directoryInfo.FullName + "\\target";
                check2 = directoryInfo.FullName + "\\sources";
                check3 = directoryInfo.FullName + "\\.git";
            }
            while (!(Directory.Exists(check1) && Directory.Exists(check2) && Directory.Exists(check3)) && directoryInfo.Parent != null);

            if (directoryInfo.Parent == null)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("Can't find you substrate project folder.");
                Console.ResetColor();
            }

            _rootPath = directoryInfo.FullName;
            _targetRootPath = _rootPath + "/target/dev";
        }

        public async Task DoCopyFromRemoteAsync()
        {
            XmlDocument xml = new XmlDocument();
            xml.Load(_projectPath);
            var nodeList = xml.GetElementsByTagName("HintPath");

            List<string> paths = new List<string>();
            foreach (XmlNode item in nodeList)
            {
                var path = ReplaceHintPath(item.InnerText);
                paths.Add(path);
            }

            await Task.WhenAll(paths.Select(p => CopyReferenceFromRemoteIsNotExistAsync(p)));
        }

        private async Task CopyReferenceFromRemoteIsNotExistAsync(string filePath)
        {
            var local = _targetRootPath + filePath;

            if (File.Exists(local) && !_override)
            {
                return;
            }

            var remote = RemoteRootPath + filePath;

            await CopyFileFromRemoteAsync(remote, local);
        }

        private async Task CopyFileFromRemoteAsync(string sourcePath, string destinationPath)
        {
            if (!File.Exists(sourcePath))
            {
                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine($"failed: {sourcePath} not exist in remote.");
                Console.ResetColor();
                return;
            }

            FileInfo des = new FileInfo(destinationPath);
            FileInfo source = new FileInfo(sourcePath);

            Dictionary<string, string> copyPaths = new Dictionary<string, string>();
            if (_getAll)
            {
                CopyAll(source.Directory, des.Directory, copyPaths);
                await Task.WhenAll(copyPaths.Select(a => CopyFileAsync(a.Key, a.Value)));
            }
            else
            {
                des.Directory.Create();
                await CopyFileAsync(sourcePath, destinationPath);
            }
            Console.ForegroundColor = ConsoleColor.Green;
            string c = copyPaths.Count == 0 ? "" : "(" + copyPaths.Count.ToString() + " files)";
            Console.WriteLine($"get {des.FullName} {c} Success.");
            Console.ResetColor();
        }

        private void CopyAll(DirectoryInfo sourceInfo, DirectoryInfo destInfo, Dictionary<string, string> copyPaths)
        {
            if (!destInfo.Exists)
            {
                destInfo.Create();
            }

            var files = sourceInfo.GetFiles();

            foreach (var item in files)
            {
                copyPaths.Add(item.FullName, destInfo + "\\" + item.Name);
            }

            var directories = sourceInfo.GetDirectories();

            foreach (var item in directories)
            {
                var subdes = destInfo.FullName + "\\" + item + "\\";
                CopyAll(item, new DirectoryInfo(subdes), copyPaths);
            }
        }

        private async Task CopyFileAsync(string sourcePath, string destinationPath)
        {
            using (Stream source = File.OpenRead(sourcePath))
            {
                using (Stream destination = File.Create(destinationPath))
                {
                    await source.CopyToAsync(destination);
                }
            }
        }

        private string ReplaceHintPath(string value)
        {
            string targetPathDir_dev = @"$(TargetPathDir)dev";
            value = value.Replace(targetPathDir_dev, "");

            string platformDir = @"$(FlavorPlatformDir)";
            string repalcePlatformDir = @"debug\amd64";
            value = value.Replace(platformDir, repalcePlatformDir);

            return value;
        }
    }
}
