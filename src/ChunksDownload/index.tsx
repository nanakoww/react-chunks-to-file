import React, {Dispatch, SetStateAction} from "react";
import asyncPool from "tiny-async-pool";
import axios, {AxiosResponse} from "axios";
import FileSaver from "file-saver";

interface IRequestStruct {
    getSizeAPI: string;
    getSizeParams: object;
    chunkDownloadAPI: string;
    chunkDownloadParams: object;
}

interface IProps extends Omit<React.HTMLAttributes<HTMLDivElement | HTMLButtonElement>, 'prefix'> {
    reqSetting: IRequestStruct;
    fileName: string;
    mime: string;
    size: number;
    concurrency: number;
    setStatus: Dispatch<SetStateAction<number | undefined>>;
    setPercent: Dispatch<SetStateAction<number | undefined>>;
}

interface IChunkResult {
    index: number;
    data: any;
}

/**
 *
 * @param reqSetting
 * 相关接口地址与参数(getSizeAPI: 用于获取文件的大小，确定发送请求的个数；getSizeParams: 获取文件大小接口的参数；chunkDownloadAPI: 分片下载；chunkDownloadParams: 分片下载接口的参数)
 * @param fileName
 * 需要保存为什么名字的文件
 * @param mime
 * 文件的类型
 * @param size
 * 分片大小（单位兆-M）
 * @param concurrency
 * 下载文件的并发线程数
 * @param setStatus
 * 设置当前状态（1：获取文件大小出现错误；2: 下载切片出现错误；）
 * @param setPercent
 * 文件上传进度（0-100）
 *
 */

export default function ChunksDownload(props:IProps) {
    const { reqSetting, fileName, mime, size, concurrency, setStatus, setPercent } = props;

    // 设置分片大小，默认 3M
    const CHUNK_SIZE = size? (size * 1024 * 1024) : (3 *1024 * 1024);

    const getFileChunk = async (start:number, end:number, index:number) => {

        // @ts-ignore
        let res:AxiosResponse = await axios.get(reqSetting.chunkDownloadAPI, {
            params: reqSetting.chunkDownloadParams,
            headers: { Range: `byte=${start}-${end}`},
            responseType: "blob",
        }).catch(() => setStatus && setStatus(2));
        return { index: index, data: res.data};
    }

    const downloadHandler = async () => {
        setPercent && setPercent(0);
        await axios.get(reqSetting.getSizeAPI, {
            params: reqSetting.getSizeParams
        }).then(async (res) => {
            if (res.status === 200) {
                const {data} = res.data;
                const fileSize = data.size;
                const chunksNum = Math.ceil(fileSize / CHUNK_SIZE);
                const chunkIndexArray = [];
                for(let i = 0; i < chunksNum; i++){
                    chunkIndexArray.push(i);
                }

                // 多并发下载
                let downloaded = 0;
                const resultChunks:IChunkResult[] = [];
                for await (const data of asyncPool(concurrency, chunkIndexArray, (i) => {
                    const start = i * CHUNK_SIZE;
                    const end = fileSize < start + CHUNK_SIZE? fileSize : start + CHUNK_SIZE;
                    return getFileChunk(start, end, i);
                })) {
                    downloaded += 1;
                    resultChunks.push(data);

                    // 计算进度，保留最多两位小数
                    const progress = Math.floor(downloaded / chunksNum * 10000) / 100;
                    setPercent && setPercent(progress < 3? 0 : progress - 3); // 预留一点处理时间的 buffer
                }

                resultChunks.sort((a:IChunkResult, b:IChunkResult) => a.index - b.index);
                const blobArray = resultChunks.map((item:IChunkResult) => item.data);
                setPercent && setPercent(100);
                const blob:BlobPart = new Blob(blobArray, {type: mime});
                FileSaver.saveAs(blob, fileName);
            }
        }).catch(() => setStatus && setStatus(1));
    }

    return (
        <div role="button" tabIndex={0} {...props} onClick={downloadHandler} onKeyPress={downloadHandler}>
            {props.children}
        </div>
    )
}
