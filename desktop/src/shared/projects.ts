export type Project = {
  id: string;
  path: string;
};

export type CreateProjectInput = {
  id?: string;
  path: string;
};

export type UpdateProjectInput = {
  id: string;
  path: string;
};
