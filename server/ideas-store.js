import { get, put, BlobPreconditionFailedError } from '@vercel/blob';
import { newBoard } from './ideas-service.js';

const pathname='dediko/ideas/board-v1.json';
export const blobIdeasStore={
  async read() {
    const result=await get(pathname,{access:'private',useCache:false});
    if(!result) return {board:newBoard(),revision:null};
    const board=await new Response(result.stream).json();
    if(board.version!==1||!Array.isArray(board.ideas)||!Array.isArray(board.activity)) throw new Error('Invalid board schema');
    return {board,revision:result.blob.etag};
  },
  async write(board,revision) {
    try {
      await put(pathname,JSON.stringify(board),{access:'private',contentType:'application/json',addRandomSuffix:false,...(revision?{ifMatch:revision}:{allowOverwrite:false})});
      return true;
    } catch(error) {
      if(error instanceof BlobPreconditionFailedError || /already exists/i.test(error.message)) return false;
      throw error;
    }
  }
};
