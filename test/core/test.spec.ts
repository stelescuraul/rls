import { Post } from './entity/Post';
import {
  closeTestingConnections,
  createTestingConnections,
  reloadTestingDatabases,
} from '../util/test-utils';
import { Connection } from 'typeorm';

describe('Test typeorm', () => {
  let connections: Connection[];
  before(async () => {
    connections = await createTestingConnections({
      entities: [__dirname + '/entity/*{.js,.ts}'],
      dropSchema: true,
    });
  });
  beforeEach(() => reloadTestingDatabases(connections));
  after(() => closeTestingConnections(connections));

  it('should save successfully and use static methods successfully', async () => {
    // These must run sequentially as we have the global context of the `Post` ActiveRecord class
    for (const connection of connections) {
      Post.useConnection(connection); // change connection each time because of AR specifics

      const post = Post.create();
      post.title = 'About ActiveRecord';
      post.tenantId = 1;
      post.userId = 1;
      await post.save();

      const loadedPost = await Post.findOne(post.id);

      loadedPost!.should.be.instanceOf(Post);
      loadedPost!.id.should.be.eql(post.id);
      loadedPost!.title.should.be.eql('About ActiveRecord');
    }
  });
});
