using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

[assembly: RuntimeCompatibility(WrapNonExceptionThrows = true)]
[assembly: CompilationRelaxations(8)]
[assembly: AssemblyVersion("0.0.0.0")]
internal class Launcher
{
	[STAThread]
	private static int Main(string[] args)
	{
		//IL_01f1: Unknown result type (might be due to invalid IL or missing references)
		try
		{
			string text = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "web", "index.html");
			if (!File.Exists(text))
			{
				throw new Exception("Les fichiers de l'application sont absents. Réinstallez l'application.");
			}
			string text2 = null;
			string[] array = new string[3]
			{
				Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
				Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
				Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)
			};
			foreach (string text3 in array)
			{
				string text4 = Path.Combine(text3, "Microsoft", "Edge", "Application", "msedge.exe");
				if (File.Exists(text4))
				{
					text2 = text4;
					break;
				}
			}
			if (text2 == null)
			{
				throw new Exception("Microsoft Edge est requis. Installez Microsoft Edge, puis relancez l'application.");
			}
			if (args.Length == 1 && args[0] == "--self-test")
			{
				return 0;
			}
			string text5 = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CommandesReanimationWin64", "Profil");
			Directory.CreateDirectory(text5);
			WindowsStorageServer windowsStorageServer = new WindowsStorageServer("C:\\commandes");
			ProcessStartInfo processStartInfo = new ProcessStartInfo(text2, "--user-data-dir=\"" + text5 + "\"                --app=\"" + new Uri(text).AbsoluteUri + "#storage=" + windowsStorageServer.Port + ":" + windowsStorageServer.Token + "\"");
			processStartInfo.UseShellExecute = false;
			Process.Start(processStartInfo);
			windowsStorageServer.Run();
			return 0;
		}
		catch (Exception ex)
		{
			if (args.Length == 0)
			{
				MessageBox.Show(ex.Message, "Commandes Réanimation", (MessageBoxButtons)0, (MessageBoxIcon)16);
			}
			return 1;
		}
	}
}
internal class WindowsStorageServer
{
	private readonly TcpListener listener = new TcpListener(IPAddress.Loopback, 0);

	private readonly string root;

	public readonly string Token = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");

	public int Port => ((IPEndPoint)listener.LocalEndpoint).Port;

	public WindowsStorageServer(string path)
	{
		root = Path.GetFullPath(path);
		string[] array = new string[3] { "Pharmacie", "Solutés", "Magasin" };
		foreach (string path2 in array)
		{
			string[] array2 = new string[4] { "Application", "Archives", "Sauvegardes", "Etiquettes" };
			foreach (string path3 in array2)
			{
				Directory.CreateDirectory(Path.Combine(root, path2, path3));
			}
		}
		listener.Start();
	}

	public string Save(string module, string category, string name, byte[] data)
	{
		if (Array.IndexOf(new string[3] { "Pharmacie", "Solutés", "Magasin" }, module) < 0)
		{
			throw new Exception("Module inconnu");
		}
		if (string.IsNullOrWhiteSpace(name) || name != Path.GetFileName(name) || name.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0 || name.EndsWith(".") || name.EndsWith(" "))
		{
			throw new Exception("Nom de fichier invalide");
		}
		string path = ((category == "Application" || string.IsNullOrEmpty(category)) ? "Application" : ((category == "Sauvegardes") ? "Sauvegardes" : ((category == "Etiquettes") ? "Etiquettes" : "Archives")));
		string text = Path.Combine(root, module, path);
		string text2 = Path.Combine(text, name);
		string text3 = text;
		while (text3 != null && text3.Length >= root.Length)
		{
			if ((File.GetAttributes(text3) & FileAttributes.ReparsePoint) != 0)
			{
				throw new Exception("Dossier redirigé non autorisé");
			}
			text3 = Path.GetDirectoryName(text3);
		}
		if (File.Exists(text2))
		{
			if ((File.GetAttributes(text2) & FileAttributes.ReparsePoint) != 0)
			{
				throw new Exception("Fichier redirigé non autorisé");
			}
			File.Copy(text2, Path.Combine(root, module, "Archives", Path.GetFileNameWithoutExtension(name) + "_" + DateTime.Now.ToString("yyyyMMdd_HHmmss_fff") + "_" + Guid.NewGuid().ToString("N").Substring(0, 6) + Path.GetExtension(name)));
		}
		string text4 = Path.Combine(text, Guid.NewGuid().ToString("N") + ".tmp");
		try
		{
			File.WriteAllBytes(text4, data);
			if (File.Exists(text2))
			{
				File.Replace(text4, text2, null);
			}
			else
			{
				File.Move(text4, text2);
			}
		}
		finally
		{
			if (File.Exists(text4))
			{
				File.Delete(text4);
			}
		}
		return text2;
	}

	public string ModuleDir(string module, string folder)
	{
		if (Array.IndexOf(new string[3] { "Pharmacie", "Solutés", "Magasin" }, module) < 0)
		{
			throw new Exception("Module inconnu");
		}
		string text = Path.Combine(root, module, folder);
		string text2 = text;
		while (text2 != null && text2.Length >= root.Length)
		{
			if ((File.GetAttributes(text2) & FileAttributes.ReparsePoint) != 0)
			{
				throw new Exception("Dossier redirigé non autorisé");
			}
			text2 = Path.GetDirectoryName(text2);
		}
		return text;
	}

	public string LatestPdf(string module)
	{
		string text = ModuleDir(module, "Archives");
		string text2 = ((module == "Pharmacie") ? "Commande_Materiel_Reanimation_" : ((module == "Solutés") ? "Commande_Solutes_" : "Commande_Aide_Soignant_"));
		string text3 = null;
		string[] files = Directory.GetFiles(text, text2 + "*.pdf");
		foreach (string text4 in files)
		{
			if ((File.GetAttributes(text4) & FileAttributes.ReparsePoint) == 0 && (text3 == null || File.GetLastWriteTimeUtc(text4) > File.GetLastWriteTimeUtc(text3)))
			{
				text3 = text4;
			}
		}
		if (text3 == null)
		{
			throw new Exception("Aucun PDF de commande enregistré dans " + text);
		}
		return text3;
	}

	private object LoadCommand(string module)
	{
		string dir = ModuleDir(module, "Sauvegardes");
		string selected = null;
		Exception failure = null;
		Thread thread = new Thread((ThreadStart)delegate
		{
			//IL_0002: Unknown result type (might be due to invalid IL or missing references)
			//IL_0008: Expected O, but got Unknown
			//IL_0042: Unknown result type (might be due to invalid IL or missing references)
			//IL_0048: Invalid comparison between Unknown and I4
			try
			{
				OpenFileDialog val = new OpenFileDialog();
				try
				{
					((FileDialog)val).InitialDirectory = dir;
					((FileDialog)val).Title = "Charger la commande — " + module;
					((FileDialog)val).Filter = "Commandes sauvegardées|*.json;*.csv;*.xlsx";
					((FileDialog)val).RestoreDirectory = true;
					if ((int)((CommonDialog)val).ShowDialog() == 1)
					{
						selected = ((FileDialog)val).FileName;
					}
				}
				finally
				{
					((IDisposable)val)?.Dispose();
				}
			}
			catch (Exception ex)
			{
				failure = ex;
			}
		});
		thread.SetApartmentState(ApartmentState.STA);
		thread.Start();
		thread.Join();
		if (failure != null)
		{
			throw failure;
		}
		if (selected == null)
		{
			return new
			{
				cancelled = true
			};
		}
		if (!string.Equals(Path.GetDirectoryName(Path.GetFullPath(selected)), dir, StringComparison.OrdinalIgnoreCase) || (File.GetAttributes(selected) & FileAttributes.ReparsePoint) != 0)
		{
			throw new Exception("Choisissez une commande dans " + dir);
		}
		string text = Path.GetExtension(selected).ToLowerInvariant();
		if (text != ".json" && text != ".csv" && text != ".xlsx")
		{
			throw new Exception("Format non pris en charge");
		}
		if (new FileInfo(selected).Length > 20000000)
		{
			throw new Exception("Fichier trop volumineux");
		}
		return new
		{
			name = Path.GetFileName(selected),
			format = text.Substring(1),
			data = Convert.ToBase64String(File.ReadAllBytes(selected))
		};
	}

	public void Run()
	{
		//IL_028c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0293: Expected O, but got Unknown
		DateTime utcNow = DateTime.UtcNow;
		while ((DateTime.UtcNow - utcNow).TotalMinutes < 3.0)
		{
			if (!listener.Pending())
			{
				Thread.Sleep(100);
				continue;
			}
			using TcpClient tcpClient = listener.AcceptTcpClient();
			tcpClient.ReceiveTimeout = 10000;
			tcpClient.SendTimeout = 10000;
			try
			{
				NetworkStream stream = tcpClient.GetStream();
				StreamReader streamReader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: false, 4096, leaveOpen: true);
				string text = streamReader.ReadLine();
				string text2 = "";
				string text3 = "";
				int num = 0;
				string text4;
				while (!string.IsNullOrEmpty(text4 = streamReader.ReadLine()))
				{
					int num2 = text4.IndexOf(':');
					if (num2 >= 0)
					{
						string text5 = text4.Substring(0, num2).ToLowerInvariant();
						string text6 = text4.Substring(num2 + 1).Trim();
						if (text5 == "content-length")
						{
							num = int.Parse(text6);
						}
						if (text5 == "x-commandes-token")
						{
							text2 = text6;
						}
						if (text5 == "origin")
						{
							text3 = text6;
						}
					}
				}
				int num3 = 200;
				string s;
				if (text3 != "null")
				{
					num3 = 403;
					s = "{}";
				}
				else if (text.StartsWith("OPTIONS "))
				{
					s = "{}";
				}
				else if (text2 != Token)
				{
					num3 = 403;
					s = "{}";
				}
				else if (text.StartsWith("POST /ping "))
				{
					utcNow = DateTime.UtcNow;
					s = "{}";
				}
				else if ((!text.StartsWith("POST /save ") && !text.StartsWith("POST /load ") && !text.StartsWith("POST /open-last-pdf ")) || num < 1 || num > 40000000)
				{
					num3 = 400;
					s = "{}";
				}
				else
				{
					utcNow = DateTime.UtcNow;
					char[] array = new char[num];
					int i;
					int num4;
					for (i = 0; i < num; i += num4)
					{
						if ((num4 = streamReader.Read(array, i, num - i)) <= 0)
						{
							break;
						}
					}
					if (i != num)
					{
						throw new Exception("Requête incomplète");
					}
					JavaScriptSerializer val = new JavaScriptSerializer();
					val.MaxJsonLength = 40000000;
					JavaScriptSerializer val2 = val;
					try
					{
						Dictionary<string, string> dictionary = val2.Deserialize<Dictionary<string, string>>(new string(array));
						if (text.StartsWith("POST /load "))
						{
							s = val2.Serialize(LoadCommand(dictionary["module"]));
						}
						else if (text.StartsWith("POST /open-last-pdf "))
						{
							string text7 = LatestPdf(dictionary["module"]);
							ProcessStartInfo processStartInfo = new ProcessStartInfo(text7);
							processStartInfo.UseShellExecute = true;
							Process.Start(processStartInfo);
							s = val2.Serialize((object)new
							{
								path = text7
							});
						}
						else
						{
							s = val2.Serialize((object)new
							{
								path = Save(dictionary["module"], dictionary["folder"], dictionary["name"], Convert.FromBase64String(dictionary["data"]))
							});
						}
					}
					catch (Exception ex)
					{
						num3 = 400;
						s = val2.Serialize((object)new
						{
							error = ex.Message
						});
					}
				}
				byte[] bytes = Encoding.UTF8.GetBytes(s);
				string s2 = "HTTP/1.1 " + num3 + " OK\r\nAccess-Control-Allow-Origin: null\r\nAccess-Control-Allow-Methods: POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, X-Commandes-Token\r\nAccess-Control-Allow-Private-Network: true\r\nContent-Type: application/json\r\nContent-Length: " + bytes.Length + "\r\nConnection: close\r\n\r\n";
				byte[] bytes2 = Encoding.ASCII.GetBytes(s2);
				stream.Write(bytes2, 0, bytes2.Length);
				stream.Write(bytes, 0, bytes.Length);
			}
			catch
			{
			}
		}
		listener.Stop();
	}
}
