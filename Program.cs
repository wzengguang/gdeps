using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace GDeps
{
    class Program
    {
        static async Task Main(string[] args)
        {
            if (args.Contains("help"))
            {
                ConsoleHelp();
                return;
            }

            var checkArgs = CheckArgsIsValid(args);

            if (checkArgs == null)
            {
                ConsoleHelp();
                return;
            }

            var dir = CheckWorkDirectory();
            if (dir != null)
            {
                //StartGetDeps();
                //StartRestore();

                var work = new SubstratePackage(dir, checkArgs);
                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine("starting...");
                Console.ResetColor();
                await work.DoCopyFromRemoteAsync();
                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine("Completed");
                Console.ResetColor();
            }
            else
            {
                ConsoleHelp();
            }
        }

        private static bool[] CheckArgsIsValid(string[] args)
        {
            bool[] arg = new bool[2];

            if (args.Length == 0)
            {
                return arg;
            }

            foreach (var item in args)
            {
                switch (item)
                {
                    case "-o":
                        arg[0] = true;
                        break;
                    case "-a":
                        arg[1] = true;
                        break;
                    default:
                        Console.ForegroundColor = ConsoleColor.Red;
                        Console.WriteLine("args not correct!");
                        Console.ResetColor();
                        return null;
                }
            }

            return arg;
        }

        private static string CheckWorkDirectory()
        {
            var dir = Directory.GetCurrentDirectory();

            string[] files = Directory.GetFiles(dir, "*.csproj");

            if (files.Length == 0)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("current directory dosen't contain a *.csproj file.");
                Console.ResetColor();
                return null;
            }
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine($"get deps of {new FileInfo(files[0]).Name}.");
            Console.ResetColor();
            return files[0];
        }

        private static void ConsoleHelp()
        {
            Console.WriteLine("-o     :   get deps override if exist");
            Console.WriteLine("-a     :   get all files of target dll in tartget dll folders.");
        }


        private static void StartGetDeps()
        {
            var process = Process.GetCurrentProcess();

            System.Diagnostics.ProcessStartInfo startInfo = new System.Diagnostics.ProcessStartInfo();
            startInfo.WorkingDirectory = Directory.GetCurrentDirectory();
            startInfo.FileName = "getdeps";
            process.StartInfo = startInfo;
            process.Start();
        }

        private static void StartRestore()
        {
            var process = Process.GetCurrentProcess();

            System.Diagnostics.ProcessStartInfo startInfo = new System.Diagnostics.ProcessStartInfo();
            startInfo.WorkingDirectory = Directory.GetCurrentDirectory();
            startInfo.FileName = "msbuild";
            startInfo.Arguments = "/t:restore";
            process.StartInfo = startInfo;
            process.Start();
        }
    }
}
