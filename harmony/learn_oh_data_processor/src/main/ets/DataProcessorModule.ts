import { AnyThreadTurboModule } from '@rnoh/react-native-openharmony/ts';
import http from '@ohos.net.http';
import util from '@ohos.util';
import fs from '@ohos.file.fs';

function decodeHTML(str: string): string {
  if (!str) return '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');
}

function unwrapDownloadUrl(url: string): string {
  if (!url) return url;
  // 如果是预览页链接，提取其中的 downloadUrl 参数
  if (url.includes('openNewWindow') && url.includes('downloadUrl=')) {
    const match = url.match(/[?&]downloadUrl=([^&]+)/);
    if (match) {
      let decoded = decodeURIComponent(match[1]);
      if (!decoded.startsWith('http')) {
        decoded = 'https://learn.tsinghua.edu.cn' + decoded;
      }
      console.info(`[DataProcessor] Unwrapped preview URL: ${url} -> ${decoded}`);
      return decoded;
    }
  }
  return url;
}

function decodeBase64(str: string): string {
  if (!str) return '';
  try {
    let base64 = new util.Base64Helper();
    let decoded = base64.decodeSync(str);
    return new util.TextDecoder().decodeWithStream(decoded);
  } catch (e) {
    console.error(`[DataProcessor] Base64 decode failed:`, e);
    return '';
  }
}

export class DataProcessorModule extends AnyThreadTurboModule {
  async processNotices(rawJson: string, courseNamesJson: string): Promise<string> {
    const rawData = JSON.parse(rawJson);
    const courseNames = JSON.parse(courseNamesJson);
    
    const processed = rawData.map((item: any) => ({
      ...item,
      courseName: courseNames[item.courseId]?.name || 'Unknown Course',
      courseTeacherName: courseNames[item.courseId]?.teacherName || '',
    })).sort((a: any, b: any) => {
      const timeA = a.publishTime instanceof Date ? a.publishTime.getTime() : new Date(a.publishTime).getTime();
      const timeB = b.publishTime instanceof Date ? b.publishTime.getTime() : new Date(b.publishTime).getTime();
      return timeB - timeA;
    });

    return JSON.stringify(processed);
  }

  async processAssignments(rawJson: string, courseNamesJson: string): Promise<string> {
    const rawData = JSON.parse(rawJson);
    const courseNames = JSON.parse(courseNamesJson);
    
    const processed = rawData.map((item: any) => ({
      ...item,
      courseName: courseNames[item.courseId]?.name || 'Unknown Course',
      courseTeacherName: courseNames[item.courseId]?.teacherName || '',
    })).sort((a: any, b: any) => {
      const timeA = a.deadline instanceof Date ? a.deadline.getTime() : new Date(a.deadline).getTime();
      const timeB = b.deadline instanceof Date ? b.deadline.getTime() : new Date(b.deadline).getTime();
      return timeB - timeA;
    });

    return JSON.stringify(processed);
  }

  async processFiles(rawJson: string, courseNamesJson: string): Promise<string> {
    const rawData = JSON.parse(rawJson);
    const courseNames = JSON.parse(courseNamesJson);
    
    const processed = rawData.map((item: any) => ({
      ...item,
      courseName: courseNames[item.courseId]?.name || 'Unknown Course',
      courseTeacherName: courseNames[item.courseId]?.teacherName || '',
    })).sort((a: any, b: any) => {
      const timeA = a.uploadTime instanceof Date ? a.uploadTime.getTime() : new Date(a.uploadTime).getTime();
      const timeB = b.uploadTime instanceof Date ? b.uploadTime.getTime() : new Date(b.uploadTime).getTime();
      return timeB - timeA;
    });

    return JSON.stringify(processed);
  }

  async fetchAssignments(courseIds: string[], cookie: string, csrfToken: string): Promise<string> {
    console.info(`[DataProcessor] fetchAssignments started for ${courseIds.length} courses`);
    const sources = [
      { url: 'https://learn.tsinghua.edu.cn/b/wlxt/kczy/zy/student/zyListWj', status: { submitted: false, graded: false } },
      { url: 'https://learn.tsinghua.edu.cn/b/wlxt/kczy/zy/student/zyListYjwg', status: { submitted: true, graded: false } },
      { url: 'https://learn.tsinghua.edu.cn/b/wlxt/kczy/zy/student/zyListYpg', status: { submitted: true, graded: true } }
    ];

    const assignmentMap = new Map<string, any>();
    const listPromises: Promise<void>[] = [];

    for (const courseId of courseIds) {
      for (const source of sources) {
        const fullUrl = `${source.url}?_csrf=${csrfToken}`;
        const promise = http.createHttp().request(fullUrl, {
          method: http.RequestMethod.POST,
          header: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': cookie,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          extraData: `aoData=${encodeURIComponent(JSON.stringify([{ name: 'wlkcid', value: courseId }]))}`
        }).then(async res => {
          if (res.responseCode === 200) {
            const resStr = typeof res.result === 'string' ? res.result : JSON.stringify(res.result);
            const json = JSON.parse(resStr);
            if (json.result === 'success') {
              const data = json.object?.aaData ?? [];
              
              const detailPromises = data.map(async (h: any) => {
                const id = h.xszyid || h.zyid;
                const currentCourseId = h.wlkcid || courseId;
                
                let description = '';
                let attachment: any = undefined;
                let submittedAttachment: any = undefined;
                let gradeAttachment: any = undefined;
                let answerAttachment: any = undefined;
                let gradeContent = h.pynr || '';
                let submittedContent = '';
                let answerContent = '';

                // 1. Fetch description via JSON API (POST)
                try {
                  const descRes = await http.createHttp().request(`https://learn.tsinghua.edu.cn/b/wlxt/kczy/zy/student/detail?_csrf=${csrfToken}`, {
                    method: http.RequestMethod.POST,
                    header: {
                      'Content-Type': 'application/x-www-form-urlencoded',
                      'Cookie': cookie,
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    },
                    extraData: `id=${h.zyid}`
                  });
                  if (descRes.responseCode === 200) {
                    const descJson = JSON.parse(descRes.result as string);
                    if (descJson.result === 'success') {
                      description = decodeHTML(descJson.msg || '');
                    }
                  }
                } catch (e) {
                  console.error(`[DataProcessor] Fetch assignment description failed for ${id}:`, e);
                }

                // 2. Fetch other details via HTML (GET)
                // Prefer viewCj if xszyid is available (even for unsubmitted ones, it often works better)
                const htmlUrl = h.xszyid 
                  ? `https://learn.tsinghua.edu.cn/f/wlxt/kczy/zy/student/viewCj?wlkcid=${currentCourseId}&xszyid=${h.xszyid}`
                  : `https://learn.tsinghua.edu.cn/f/wlxt/kczy/zy/student/viewZy?wlkcid=${currentCourseId}&zyid=${h.zyid}`;

                try {
                  const htmlRes = await http.createHttp().request(htmlUrl, {
                    method: http.RequestMethod.GET,
                    header: {
                      'Cookie': cookie,
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                  });
                  if (htmlRes.responseCode === 200) {
                    const html = htmlRes.result as string;
                    
                    // Improved regex to extract attachments following thu-learn-lib pattern
                    const extractAttachment = (htmlPart: string) => {
                      // Find the first <a> tag that looks like a download link
                      const aMatch = htmlPart.match(/<a[^>]*href\s*=\s*["']([^"']*(?:downloadFile|openNewWindow|fileId=|wjid=)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i);
                      if (!aMatch) return undefined;
                      
                      let downloadUrl = aMatch[1];
                      if (!downloadUrl.startsWith('http')) {
                        downloadUrl = 'https://learn.tsinghua.edu.cn' + downloadUrl;
                      }
                      downloadUrl = unwrapDownloadUrl(downloadUrl);
                      
                      // Name is either the inner HTML of the <a> tag (stripping nested tags) or a title attribute
                      let name = aMatch[2].replace(/<[^>]+>/g, '').trim();
                      if (!name || name.length < 2) {
                        const titleMatch = aMatch[0].match(/title\s*=\s*["']([^"']+)["']/i);
                        if (titleMatch) name = titleMatch[1];
                      }
                      
                      // If still no name, try to find it in the surrounding text (ftitle span)
                      if (!name || name.length < 2) {
                        const ftitleMatch = htmlPart.match(/<span[^>]*class="ftitle"[^>]*>([^<]+)<\/span>/i);
                        if (ftitleMatch) name = ftitleMatch[1];
                      }

                      return {
                        name: decodeHTML(name || 'Attachment'),
                        downloadUrl: downloadUrl
                      };
                    };

                    // Find all "list fujian clearfix" blocks
                    const fujianBlocks: string[] = [];
                    const searchStr = 'class="list fujian clearfix"';
                    let startPos = 0;
                    while (true) {
                      const idx = html.indexOf(searchStr, startPos);
                      if (idx === -1) break;
                      // Take a chunk of 2000 chars after this to ensure we cover the whole block
                      fujianBlocks.push(html.substring(idx, idx + 2000));
                      startPos = idx + searchStr.length;
                    }

                    if (fujianBlocks.length > 0) attachment = extractAttachment(fujianBlocks[0]);
                    if (fujianBlocks.length > 1) answerAttachment = extractAttachment(fujianBlocks[1]);
                    if (fujianBlocks.length > 2) submittedAttachment = extractAttachment(fujianBlocks[2]);
                    if (fujianBlocks.length > 3) gradeAttachment = extractAttachment(fujianBlocks[3]);

                    if (attachment) {
                      console.info(`[DataProcessor] Assignment ${id} attachment found: ${attachment.name}`);
                    } else {
                      console.info(`[DataProcessor] No attachment for ${id}. HTML length: ${html.length}, Fujian blocks: ${fujianBlocks.length}`);
                    }
                  }
                } catch (e) {
                  console.error(`[DataProcessor] Fetch assignment HTML failed for ${id}:`, e);
                }

                const assignment = {
                  id: id,
                  studentHomeworkId: h.xszyid,
                  baseId: h.zyid,
                  title: decodeHTML(h.bt),
                  url: htmlUrl,
                  deadline: h.jzsj,
                  lateSubmissionDeadline: h.bjjzsj ? h.bjjzsj : undefined,
                  isLateSubmission: h.sfbj === '1',
                  completionType: h.zywcfs,
                  submissionType: h.zytjfs,
                  submitUrl: `https://learn.tsinghua.edu.cn/f/wlxt/kczy/zy/student/tijiao?wlkcid=${h.wlkcid}&xszyid=${h.xszyid}`,
                  submitTime: h.scsj === null ? undefined : h.scsj,
                  grade: h.cj === null ? undefined : h.cj,
                  graderName: h.jsm,
                  courseId: courseId,
                  submitted: source.status.submitted,
                  graded: source.status.graded,
                  description,
                  attachment,
                  submittedAttachment,
                  gradeAttachment,
                  answerAttachment,
                  gradeContent,
                  submittedContent,
                  answerContent
                };
                
                if (assignmentMap.has(id)) {
                  const existing = assignmentMap.get(id);
                  // Merge carefully to avoid losing details fetched from HTML
                  const merged = { ...existing, ...assignment };
                  if (!assignment.attachment && existing.attachment) merged.attachment = existing.attachment;
                  if (!assignment.description && existing.description) merged.description = existing.description;
                  if (!assignment.submittedAttachment && existing.submittedAttachment) merged.submittedAttachment = existing.submittedAttachment;
                  if (!assignment.gradeAttachment && existing.gradeAttachment) merged.gradeAttachment = existing.gradeAttachment;
                  if (!assignment.answerAttachment && existing.answerAttachment) merged.answerAttachment = existing.answerAttachment;
                  assignmentMap.set(id, merged);
                } else {
                  assignmentMap.set(id, assignment);
                }
              });
              await Promise.all(detailPromises);
            }
          }
        }).catch(err => {
          console.error(`[DataProcessor] Fetch assignments failed for ${courseId} at ${source.url}:`, err);
        });
        listPromises.push(promise);
      }
    }

    await Promise.all(listPromises);
    const result = Array.from(assignmentMap.values());
    console.info(`[DataProcessor] fetchAssignments finished. Total: ${result.length}`);
    return JSON.stringify(result);
  }

  async fetchNotices(courseIds: string[], cookie: string, csrfToken: string): Promise<string> {
    console.info(`[DataProcessor] fetchNotices started for ${courseIds.length} courses`);
    const urls = [
      'https://learn.tsinghua.edu.cn/b/wlxt/kcgg/wlkc_ggb/student/pageListXsbyWgq',
      'https://learn.tsinghua.edu.cn/b/wlxt/kcgg/wlkc_ggb/student/pageListXsbyYgq'
    ];

    const allResults: any[] = [];
    const listPromises: Promise<void>[] = [];

    for (const courseId of courseIds) {
      for (const url of urls) {
        const fullUrl = `${url}?_csrf=${csrfToken}`;
        const promise = http.createHttp().request(fullUrl, {
          method: http.RequestMethod.POST,
          header: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': cookie,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          extraData: `aoData=${encodeURIComponent(JSON.stringify([{ name: 'wlkcid', value: courseId }]))}`
        }).then(async res => {
          if (res.responseCode === 200) {
            const resStr = typeof res.result === 'string' ? res.result : JSON.stringify(res.result);
            const json = JSON.parse(resStr);
            if (json.result === 'success') {
              const data = json.object?.aaData ?? json.object?.resultsList ?? [];
              
              const detailPromises = data.map(async (n: any) => {
                // 1. Content is in the list response (Base64 encoded)
                let content = decodeHTML(decodeBase64(n.ggnr || ''));
                let attachment: any = undefined;

                // 2. If there's an attachment, fetch HTML to get the ID
                const attachmentName = n.fjmc || n.fjbt;
                if (attachmentName && attachmentName !== 'null') {
                  const detailUrl = `https://learn.tsinghua.edu.cn/f/wlxt/kcgg/wlkc_ggb/student/beforeViewXs?wlkcid=${courseId}&id=${n.ggid}`;
                  try {
                    const detailRes = await http.createHttp().request(detailUrl, {
                      method: http.RequestMethod.GET,
                      header: {
                        'Cookie': cookie,
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                      }
                    });
                    if (detailRes.responseCode === 200) {
                      const html = detailRes.result as string;
                      // Match class="ml-10" which is used for attachments in notices (more flexible regex)
                      const ml10Match = html.match(/<a[^>]*class\s*=\s*["'][^"']*ml-10[^"']*["'][^>]*href\s*=\s*["']([^"']+)["']/i);
                      if (ml10Match) {
                        let path = ml10Match[1];
                        const wjidMatch = path.match(/(?:wjid|fileId)=([^"&]+)/i);
                        if (wjidMatch) {
                          const wjid = wjidMatch[1];
                          attachment = {
                            name: decodeHTML(attachmentName),
                            downloadUrl: `https://learn.tsinghua.edu.cn/b/wlxt/kj/wlkc_kjxxb/student/downloadFile?sfgk=0&wjid=${wjid}`
                          };
                          console.info(`[DataProcessor] Notice ${n.ggid} attachment found via ml-10: ${attachment.name}`);
                        }
                      }
                      
                      if (!attachment) {
                        // Fallback to generic download link match
                        const hrefMatch = html.match(/href\s*=\s*["']([^"']*(?:downloadFile|openNewWindow|fileId=)[^"']*)["']/i);
                        if (hrefMatch) {
                          let downloadUrl = hrefMatch[1];
                          if (!downloadUrl.startsWith('http')) {
                            downloadUrl = 'https://learn.tsinghua.edu.cn' + downloadUrl;
                          }
                          downloadUrl = unwrapDownloadUrl(downloadUrl);
                          attachment = {
                            name: decodeHTML(attachmentName),
                            downloadUrl: downloadUrl
                          };
                          console.info(`[DataProcessor] Notice ${n.ggid} attachment found via fallback: ${attachment.name}`);
                        }
                      }
                    }
                  } catch (e) {
                    console.error(`[DataProcessor] Fetch notice attachment failed for ${n.ggid}:`, e);
                  }
                }

                allResults.push({
                  id: n.ggid,
                  title: decodeHTML(n.bt),
                  publisher: n.fbrxm,
                  publishTime: n.fbsj && typeof n.fbsj === 'string' ? n.fbsj : n.fbsjStr,
                  expireTime: n.jzsj ?? undefined,
                  markedImportant: Number(n.sfqd) === 1,
                  hasRead: n.sfyd === '1' || n.sfyd === 1 || n.sfyd === '是' || n.sfyd === '已读',
                  url: `https://learn.tsinghua.edu.cn/f/wlxt/kcgg/wlkc_ggb/student/beforeViewXs?wlkcid=${courseId}&id=${n.ggid}`,
                  courseId: courseId,
                  content: content,
                  attachment: attachment
                });
              });
              await Promise.all(detailPromises);
            }
          }
        }).catch(err => {
          console.error(`[DataProcessor] Fetch notices failed for ${courseId}:`, err);
        });
        listPromises.push(promise);
      }
    }

    await Promise.all(listPromises);
    console.info(`[DataProcessor] fetchNotices finished. Total: ${allResults.length}`);
    return JSON.stringify(allResults);
  }

  async fetchFiles(courseIds: string[], cookie: string, csrfToken: string): Promise<string> {
    const allResults: any[] = [];
    const promises: Promise<void>[] = [];

    for (const courseId of courseIds) {
      const url = `https://learn.tsinghua.edu.cn/b/wlxt/kj/wlkc_kjxxb/student/kjxxbByWlkcidAndSizeForStudent?wlkcid=${courseId}&size=200&_csrf=${csrfToken}`;
      const promise = http.createHttp().request(url, {
        method: http.RequestMethod.GET,
        header: {
          'Cookie': cookie,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }).then(res => {
        if (res.responseCode === 200) {
          const json = JSON.parse(res.result as string);
          if (json.result === 'success') {
            const data = Array.isArray(json.object) ? json.object : [];
            data.forEach((f: any) => {
              allResults.push({
                id: f.kjxxid,
                fileId: f.wjid,
                title: decodeHTML(f.bt),
                description: decodeHTML(f.ms),
                size: f.fileSize,
                uploadTime: f.scsj,
                fileType: f.wjlx,
                courseId: courseId,
                isNew: f.isNew === true || f.isNew === 'true' || f.isNew === 1,
                downloadUrl: `https://learn.tsinghua.edu.cn/b/wlxt/kj/wlkc_kjxxb/student/downloadFile?sfgk=0&wjid=${f.wjid}`
              });
            });
          }
        }
      }).catch(err => {
        console.error(`[DataProcessor] Fetch files failed for ${courseId}:`, err);
      });
      promises.push(promise);
    }

    await Promise.all(promises);
    return JSON.stringify(allResults);
  }

  async moveToBackground(): Promise<void> {
    try {
      await this.ctx.uiAbilityContext.moveAbilityToBackground();
    } catch (e) {
      console.error(`[DataProcessor] moveAbilityToBackground failed:`, e);
    }
  }

  async post(url: string, cookie: string, csrfToken: string, paramsJson: string, filePath?: string, fileName?: string, fileType?: string, requestId?: string): Promise<string> {
    console.info(`[DataProcessor] post started for ${url}, requestId: ${requestId}`);
    const params = JSON.parse(paramsJson);
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    
    let bodyParts: ArrayBuffer[] = [];
    const textEncoder = new util.TextEncoder();

    // Add text parameters
    for (const key in params) {
      let part = `--${boundary}\r\n`;
      part += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
      part += `${params[key]}\r\n`;
      bodyParts.push(textEncoder.encodeInto(part).buffer as ArrayBuffer);
    }

    // Add file if provided
    if (filePath) {
      try {
        let realPath = filePath;
        if (realPath.startsWith('file://')) {
          realPath = realPath.substring(7);
        }
        
        if (fs.accessSync(realPath)) {
          let file = fs.openSync(realPath, fs.OpenMode.READ_ONLY);
          let stat = fs.statSync(file.fd);
          let buf = new ArrayBuffer(stat.size);
          fs.readSync(file.fd, buf);
          fs.closeSync(file);

          let partHeader = `--${boundary}\r\n`;
          partHeader += `Content-Disposition: form-data; name="fileupload"; filename="${fileName || 'file'}"\r\n`;
          partHeader += `Content-Type: ${fileType || 'application/octet-stream'}\r\n\r\n`;
          
          bodyParts.push(textEncoder.encodeInto(partHeader).buffer as ArrayBuffer);
          bodyParts.push(buf);
          bodyParts.push(textEncoder.encodeInto('\r\n').buffer as ArrayBuffer);
        } else {
          console.error(`[DataProcessor] File not accessible: ${realPath}`);
        }
      } catch (e) {
        console.error(`[DataProcessor] Failed to read file for upload: ${e.message}`);
      }
    }

    bodyParts.push(textEncoder.encodeInto(`--${boundary}--\r\n`).buffer as ArrayBuffer);

    // Combine all parts into one ArrayBuffer
    let totalLength = bodyParts.reduce((acc, val) => acc + val.byteLength, 0);
    let combinedBody = new Uint8Array(totalLength);
    let offset = 0;
    for (let part of bodyParts) {
      combinedBody.set(new Uint8Array(part), offset);
      offset += part.byteLength;
    }

    return new Promise((resolve, reject) => {
      const httpRequest = http.createHttp();
      
      if (requestId) {
        httpRequest.on('dataSendProgress', (data) => {
          this.ctx.rnInstance.emitDeviceEvent('LearnOHUploadProgress', {
            requestId: requestId,
            loaded: data.sendSize,
            total: data.totalSize
          });
        });
      }

      httpRequest.request(url, {
        method: http.RequestMethod.POST,
        header: {
          'Cookie': cookie,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        extraData: combinedBody.buffer,
        expectDataType: http.HttpDataType.STRING,
      }).then(res => {
        console.info(`[DataProcessor] post finished with status ${res.responseCode}`);
        httpRequest.off('dataSendProgress');
        resolve(res.result as string);
      }).catch(err => {
        console.error(`[DataProcessor] post failed:`, err);
        httpRequest.off('dataSendProgress');
        reject(err);
      });
    });
  }
}
