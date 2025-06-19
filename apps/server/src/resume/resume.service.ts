import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { CreateResumeDto, ImportResumeDto, ResumeDto, UpdateResumeDto } from "@reactive-resume/dto";
import { defaultResumeData, ResumeData } from "@reactive-resume/schema";
import type { DeepPartial } from "@reactive-resume/utils";
import { ErrorMessage, generateRandomName } from "@reactive-resume/utils";
import slugify from "@sindresorhus/slugify";
import deepmerge from "deepmerge";
import { PrismaService } from "nestjs-prisma";

import { PrinterService } from "@/server/printer/printer.service";

import { StorageService } from "../storage/storage.service";

@Injectable()
export class ResumeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly printerService: PrinterService,
    private readonly storageService: StorageService,
  ) {}

  async create(userId: string, createResumeDto: CreateResumeDto) {
    const { name, email, picture } = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true, email: true, picture: true },
    });

    const data = deepmerge(defaultResumeData, {
      basics: { name, email, picture: { url: picture ?? "" } },
    } satisfies DeepPartial<ResumeData>);

    const resume = await this.prisma.resume.create({
      data: {
        data,
        userId,
        title: createResumeDto.title,
        visibility: createResumeDto.visibility,
        slug: createResumeDto.slug ?? slugify(createResumeDto.title),
      },
    });

    // Generate preview image in the background (don't wait for it)
    this.generateAndSavePreview(resume as ResumeDto).catch((error: unknown) => {
      Logger.error(`Failed to generate preview for new resume ${resume.id}:`, error);
    });

    return resume;
  }

  async import(userId: string, importResumeDto: ImportResumeDto) {
    const randomTitle = generateRandomName();

    const resume = await this.prisma.resume.create({
      data: {
        userId,
        visibility: "private",
        data: importResumeDto.data,
        title: importResumeDto.title ?? randomTitle,
        slug: importResumeDto.slug ?? slugify(randomTitle),
      },
    });

    // Generate preview image in the background (don't wait for it)
    this.generateAndSavePreview(resume as ResumeDto).catch((error: unknown) => {
      Logger.error(`Failed to generate preview for imported resume ${resume.id}:`, error);
    });

    return resume;
  }

  findAll(userId: string) {
    return this.prisma.resume.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } });
  }

  findOne(id: string, userId?: string) {
    if (userId) {
      return this.prisma.resume.findUniqueOrThrow({ where: { userId_id: { userId, id } } });
    }

    return this.prisma.resume.findUniqueOrThrow({ where: { id } });
  }

  async findOneStatistics(id: string) {
    const result = await this.prisma.statistics.findFirst({
      select: { views: true, downloads: true },
      where: { resumeId: id },
    });

    return {
      views: result?.views ?? 0,
      downloads: result?.downloads ?? 0,
    };
  }

  async findOneByUsernameSlug(username: string, slug: string, userId?: string) {
    const resume = await this.prisma.resume.findFirstOrThrow({
      where: { user: { username }, slug, visibility: "public" },
    });

    // Update statistics: increment the number of views by 1
    if (!userId) {
      await this.prisma.statistics.upsert({
        where: { resumeId: resume.id },
        create: { views: 1, downloads: 0, resumeId: resume.id },
        update: { views: { increment: 1 } },
      });
    }

    return resume;
  }

  async update(userId: string, id: string, updateResumeDto: UpdateResumeDto) {
    try {
      const { locked } = await this.prisma.resume.findUniqueOrThrow({
        where: { id },
        select: { locked: true },
      });

      if (locked) throw new BadRequestException(ErrorMessage.ResumeLocked);

      const updatedResume = await this.prisma.resume.update({
        data: {
          title: updateResumeDto.title,
          slug: updateResumeDto.slug,
          visibility: updateResumeDto.visibility,
          data: updateResumeDto.data as Prisma.JsonObject,
        },
        where: { userId_id: { userId, id } },
      });

      // If resume data was updated, regenerate the preview in the background
      if (updateResumeDto.data) {
        this.generateAndSavePreview(updatedResume as ResumeDto).catch((error: unknown) => {
          Logger.error(`Failed to regenerate preview for updated resume ${id}:`, error);
        });
      }

      return updatedResume;
    } catch (error) {
      if (error.code === "P2025") {
        Logger.error(error);
        throw new InternalServerErrorException(error);
      }
    }
  }

  lock(userId: string, id: string, set: boolean) {
    return this.prisma.resume.update({
      data: { locked: set },
      where: { userId_id: { userId, id } },
    });
  }

  async remove(userId: string, id: string) {
    await Promise.all([
      // Remove files in storage, and their cached keys
      this.storageService.deleteObject(userId, "resumes", id),
      this.storageService.deleteObject(userId, "previews", id),
    ]);

    return this.prisma.resume.delete({ where: { userId_id: { userId, id } } });
  }

  async printResume(resume: ResumeDto, userId?: string) {
    const url = await this.printerService.printResume(resume);

    // Update statistics: increment the number of downloads by 1
    if (!userId) {
      await this.prisma.statistics.upsert({
        where: { resumeId: resume.id },
        create: { views: 0, downloads: 1, resumeId: resume.id },
        update: { downloads: { increment: 1 } },
      });
    }

    return url;
  }

  printPreview(resume: ResumeDto) {
    return this.printerService.printPreview(resume);
  }

  /**
   * Generate a preview image for the resume and save the URL to the database
   */
  private async generateAndSavePreview(resume: ResumeDto): Promise<string | null> {
    try {
      const previewUrl = await this.printerService.generatePreview(resume);

      // Update the resume with the preview URL
      await this.prisma.resume.update({
        where: { id: resume.id },
        data: { previewUrl } as Prisma.ResumeUpdateInput,
      });

      return previewUrl;
    } catch (error) {
      Logger.error(`Failed to generate preview for resume ${resume.id}:`, error);
      return null;
    }
  }

  /**
   * Generate preview for a resume (public method for manual regeneration)
   */
  async regeneratePreview(userId: string, id: string): Promise<string | null> {
    const resume = (await this.findOne(id, userId)) as ResumeDto;
    return this.generateAndSavePreview(resume);
  }

  /**
   * Batch regenerate previews for all resumes without preview URLs
   */
  async batchRegeneratePreview(userId: string): Promise<{ count: number }> {
    // Find all resumes for the user
    const allResumes = await this.prisma.resume.findMany({
      where: { userId },
    });

    // For now, regenerate previews for all resumes
    // TODO: Filter by previewUrl once Prisma client is regenerated
    let count = 0;
    for (const resume of allResumes) {
      this.generateAndSavePreview(resume as ResumeDto).catch((error: unknown) => {
        Logger.error(`Failed to generate preview for resume ${resume.id}:`, error);
      });
      count++;
    }

    Logger.log(`Started preview generation for ${count} resumes for user ${userId}`);
    return { count };
  }
}
