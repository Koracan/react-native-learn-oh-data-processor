import { AnyThreadTurboModule } from '@rnoh/react-native-openharmony/ts';
import http from '@ohos.net.http';

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
    const sources = [
      { url: 'https://learn.tsinghua.edu.cn/b/wlxt/kczy/zy/student/zyListWj', status: { submitted: false, graded: false } },
      { url: 'https://learn.tsinghua.edu.cn/b/wlxt/kczy/zy/student/zyListYjwg', status: { submitted: true, graded: false } },
      { url: 'https://learn.tsinghua.edu.cn/b/wlxt/kczy/zy/student/zyListYpg', status: { submitted: true, graded: true } }
    ];

    const assignmentMap = new Map<string, any>();
    const promises: Promise<void>[] = [];

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
        }).then(res => {
          if (res.responseCode === 200) {
            const json = JSON.parse(res.result as string);
            if (json.result === 'success') {
              const data = json.object?.aaData ?? [];
              data.forEach((h: any) => {
                const id = h.xszyid;
                const assignment = {
                  id: h.xszyid,
                  studentHomeworkId: h.xszyid,
                  baseId: h.zyid,
                  title: decodeHTML(h.bt),
                  url: `https://learn.tsinghua.edu.cn/f/wlxt/kczy/zy/student/viewCj?wlkcid=${h.wlkcid}&xszyid=${h.xszyid}`,
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
                  graded: source.status.graded
                };
                if (assignmentMap.has(id)) {
                  const existing = assignmentMap.get(id);
                  assignmentMap.set(id, { ...existing, ...assignment });
                } else {
                  assignmentMap.set(id, assignment);
                }
              });
            }
          }
        }).catch(err => {
          console.error(`[DataProcessor] Fetch failed for ${courseId} at ${source.url}:`, err);
        });
        promises.push(promise);
      }
    }

    await Promise.all(promises);
    return JSON.stringify(Array.from(assignmentMap.values()));
  }

  async fetchNotices(courseIds: string[], cookie: string, csrfToken: string): Promise<string> {
    const urls = [
      'https://learn.tsinghua.edu.cn/b/wlxt/kcgg/wlkc_ggb/student/pageListXsbyWgq',
      'https://learn.tsinghua.edu.cn/b/wlxt/kcgg/wlkc_ggb/student/pageListXsbyYgq'
    ];

    const allResults: any[] = [];
    const promises: Promise<void>[] = [];

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
        }).then(res => {
          if (res.responseCode === 200) {
            const json = JSON.parse(res.result as string);
            if (json.result === 'success') {
              const data = json.object?.aaData ?? json.object?.resultsList ?? [];
              data.forEach((n: any) => {
                allResults.push({
                  id: n.ggid,
                  title: decodeHTML(n.bt),
                  publisher: n.fbrxm,
                  publishTime: n.fbsj && typeof n.fbsj === 'string' ? n.fbsj : n.fbsjStr,
                  expireTime: n.jzsj ?? undefined,
                  markedImportant: Number(n.sfqd) === 1,
                  hasRead: n.sfyd === '1' || n.sfyd === 1 || n.sfyd === '是' || n.sfyd === '已读',
                  url: `https://learn.tsinghua.edu.cn/f/wlxt/kcgg/wlkc_ggb/student/beforeViewXs?wlkcid=${courseId}&id=${n.ggid}`,
                  courseId: courseId
                });
              });
            }
          }
        }).catch(err => {
          console.error(`[DataProcessor] Fetch notices failed for ${courseId}:`, err);
        });
        promises.push(promise);
      }
    }

    await Promise.all(promises);
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
}
