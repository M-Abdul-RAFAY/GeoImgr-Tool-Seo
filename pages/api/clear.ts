// pages/api/clear.ts
import { NextApiRequest, NextApiResponse } from "next";
import { promises as fs } from "fs";
import { join } from "path";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const tempDir = join(process.cwd(), "temp");

    // Check if temp directory exists
    try {
      await fs.access(tempDir);
    } catch {
      // Directory doesn't exist, nothing to clear
      return res.status(200).json({ message: "No files to clear" });
    }

    // Read all files in temp directory
    const files = await fs.readdir(tempDir);

    if (files.length === 0) {
      return res.status(200).json({ message: "No files to clear" });
    }

    // Delete all files
    let deletedCount = 0;
    const errors: string[] = [];

    for (const file of files) {
      try {
        const filePath = join(tempDir, file);
        const stats = await fs.stat(filePath);

        // Only delete files, not directories
        if (stats.isFile()) {
          await fs.unlink(filePath);
          deletedCount++;
          console.log("Deleted file:", file);
        }
      } catch (error) {
        console.error("Error deleting file:", file, error);
        errors.push(`Failed to delete ${file}: ${error}`);
      }
    }

    if (errors.length > 0) {
      return res.status(207).json({
        message: `Cleared ${deletedCount} files with ${errors.length} errors`,
        deletedCount,
        errors,
      });
    }

    res.status(200).json({
      message: `Successfully cleared ${deletedCount} files`,
      deletedCount,
    });
  } catch (error) {
    console.error("Clear error:", error);
    res.status(500).json({ error: "Failed to clear files" });
  }
}
